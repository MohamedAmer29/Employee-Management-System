import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import { RedisService } from '../redis/redis.service';
import {
  OTP_DEFAULTS,
  OtpKeys,
  normalizeEmail,
} from './constants/otp.constants';

export enum OtpVerificationResult {
  VALID = 'VALID',
  INVALID = 'INVALID',
  EXPIRED = 'EXPIRED',
  TOO_MANY_ATTEMPTS = 'TOO_MANY_ATTEMPTS',
}

export interface OtpIssueResult {
  otp: string;
  expiresInSeconds: number;
}

/**
 * Owns the entire OTP lifecycle: generation, hashing, Redis storage,
 * verification, attempt limiting and resend rate limiting.
 *
 * Deliberately knows nothing about email delivery - MailService handles that -
 * so the two concerns stay independently testable and reusable.
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly pepper: string;

  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {
    // The OTP hash is keyed with the JWT secret as a pepper. This means a
    // leaked Redis dump alone is not enough to brute-force a 6-digit OTP.
    this.pepper = this.configService.getOrThrow<string>('JWT_SECRET');
  }

  getOtpLength(): number {
    const configured = Number(
      this.configService.get<string>('OTP_LENGTH') ?? OTP_DEFAULTS.LENGTH,
    );

    return Number.isNaN(configured) || configured < 4
      ? OTP_DEFAULTS.LENGTH
      : configured;
  }

  getExpiresInSeconds(): number {
    const configured = Number(
      this.configService.get<string>('OTP_EXPIRES_IN') ??
        OTP_DEFAULTS.EXPIRES_IN_SECONDS,
    );

    return Number.isNaN(configured) || configured <= 0
      ? OTP_DEFAULTS.EXPIRES_IN_SECONDS
      : configured;
  }

  getExpiresInMinutes(): number {
    return Math.max(Math.round(this.getExpiresInSeconds() / 60), 1);
  }

  /**
   * Cryptographically secure numeric OTP.
   * crypto.randomInt is used instead of Math.random so the value is not
   * predictable from previously observed codes.
   */
  generateOtp(): string {
    const length = this.getOtpLength();
    const min = 10 ** (length - 1);
    const max = 10 ** length;

    return randomInt(min, max).toString();
  }

  /**
   * Generates an OTP, stores only its hash in Redis under a TTL and resets any
   * previous failed-attempt counter. Issuing a new OTP overwrites the old one,
   * which invalidates it.
   *
   * The plaintext OTP is returned to the caller purely so it can be emailed -
   * it is never logged or persisted.
   */
  async issueOtp(email: string): Promise<OtpIssueResult> {
    const otp = this.generateOtp();
    const expiresInSeconds = this.getExpiresInSeconds();

    await this.redisService.set(
      OtpKeys.otp(email),
      this.hashOtp(email, otp),
      expiresInSeconds,
    );

    await this.redisService.delete(OtpKeys.attempts(email));

    return { otp, expiresInSeconds };
  }

  /**
   * Verifies a submitted OTP.
   *
   * Failed attempts are counted; once the limit is reached the stored OTP is
   * destroyed so a brute-force run cannot continue against the same code.
   */
  async verifyOtp(
    email: string,
    submittedOtp: string,
  ): Promise<OtpVerificationResult> {
    const storedHash = await this.redisService.get(OtpKeys.otp(email));

    if (storedHash === null) {
      return OtpVerificationResult.EXPIRED;
    }

    const attempts = await this.getFailedAttempts(
      OtpKeys.attempts(email),
      OtpKeys.otp(email),
    );

    if (attempts >= OTP_DEFAULTS.MAX_FAILED_ATTEMPTS) {
      await this.clearOtp(email);
      return OtpVerificationResult.TOO_MANY_ATTEMPTS;
    }

    if (!this.matches(email, submittedOtp, storedHash)) {
      const updated = await this.redisService.incrementWithTtl(
        OtpKeys.attempts(email),
        this.getExpiresInSeconds(),
      );

      if (
        updated !== null &&
        updated.count >= OTP_DEFAULTS.MAX_FAILED_ATTEMPTS
      ) {
        await this.redisService.delete(OtpKeys.otp(email));
        return OtpVerificationResult.TOO_MANY_ATTEMPTS;
      }

      return OtpVerificationResult.INVALID;
    }

    return OtpVerificationResult.VALID;
  }

  /**
   * Removes the OTP and the attempt counter. Called after a successful
   * verification and whenever email delivery fails.
   */
  async clearOtp(email: string): Promise<void> {
    await this.redisService.delete(OtpKeys.otp(email), OtpKeys.attempts(email));
  }

  /**
   * Generates a password-reset OTP stored under a namespace separate from the
   * email-verification flow so the two never collide or overwrite each other.
   */
  async issuePasswordResetOtp(email: string): Promise<OtpIssueResult> {
    const otp = this.generateOtp();
    const expiresInSeconds = this.getPasswordResetExpiresInSeconds();

    await this.redisService.set(
      OtpKeys.passwordResetOtp(email),
      this.hashOtp(email, otp),
      expiresInSeconds,
    );
    await this.redisService.delete(OtpKeys.passwordResetAttempts(email));

    return { otp, expiresInSeconds };
  }

  async verifyPasswordResetOtp(
    email: string,
    submittedOtp: string,
  ): Promise<OtpVerificationResult> {
    const storedHash = await this.redisService.get(
      OtpKeys.passwordResetOtp(email),
    );

    if (storedHash === null) {
      return OtpVerificationResult.EXPIRED;
    }

    const attempts = await this.getFailedAttempts(
      OtpKeys.passwordResetAttempts(email),
      OtpKeys.passwordResetOtp(email),
    );

    if (attempts >= OTP_DEFAULTS.MAX_FAILED_ATTEMPTS) {
      await this.clearPasswordResetOtp(email);
      return OtpVerificationResult.TOO_MANY_ATTEMPTS;
    }

    if (!this.matches(email, submittedOtp, storedHash)) {
      const updated = await this.redisService.incrementWithTtl(
        OtpKeys.passwordResetAttempts(email),
        this.getPasswordResetExpiresInSeconds(),
      );

      if (
        updated !== null &&
        updated.count >= OTP_DEFAULTS.MAX_FAILED_ATTEMPTS
      ) {
        await this.redisService.delete(OtpKeys.passwordResetOtp(email));
        return OtpVerificationResult.TOO_MANY_ATTEMPTS;
      }

      return OtpVerificationResult.INVALID;
    }

    return OtpVerificationResult.VALID;
  }

  async clearPasswordResetOtp(email: string): Promise<void> {
    await this.redisService.delete(
      OtpKeys.passwordResetOtp(email),
      OtpKeys.passwordResetAttempts(email),
    );
  }

  getPasswordResetExpiresInSeconds(): number {
    const configured = Number(
      this.configService.get<string>('PASSWORD_RESET_OTP_EXPIRES_IN') ??
        this.getExpiresInSeconds(),
    );

    return Number.isNaN(configured) || configured <= 0
      ? this.getExpiresInSeconds()
      : configured;
  }

  /**
   * Resend rate limiting, e.g. max 3 requests per 15 minutes per email.
   * Returns false when the caller has exceeded the allowance.
   *
   * Fails open when Redis is unavailable so a cache outage cannot block
   * legitimate account activation entirely.
   */
  async consumeResendAllowance(email: string): Promise<boolean> {
    if (!this.redisService.isAvailable()) {
      return true;
    }

    const result = await this.redisService.consumeRateLimit(
      OtpKeys.rate(email),
      OTP_DEFAULTS.MAX_RESEND_REQUESTS,
      OTP_DEFAULTS.RESEND_WINDOW_SECONDS,
    );

    return result.allowed;
  }

  async clearResendAllowance(email: string): Promise<void> {
    await this.redisService.delete(OtpKeys.rate(email));
  }

  private async getFailedAttempts(
    attemptsKey: string,
    otpKey: string,
  ): Promise<number> {
    const raw = await this.redisService.get(attemptsKey);

    if (raw === null) {
      return 0;
    }

    const parsed = Number(raw);
    return Number.isNaN(parsed) || parsed < 0 ? 0 : parsed;
  }

  /**
   * HMAC-SHA256 over the normalised email + OTP. Binding the email into the
   * hash prevents a hash captured for one account from being replayed against
   * another.
   */
  private hashOtp(email: string, otp: string): string {
    return createHmac('sha256', this.pepper)
      .update(`${normalizeEmail(email)}:${otp}`)
      .digest('hex');
  }

  private matches(email: string, otp: string, storedHash: string): boolean {
    const candidate = Buffer.from(this.hashOtp(email, otp), 'utf8');
    const stored = Buffer.from(storedHash, 'utf8');

    if (candidate.length !== stored.length) {
      return false;
    }

    return timingSafeEqual(candidate, stored);
  }
}
