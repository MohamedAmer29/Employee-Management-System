import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { User } from '../users/entities/user.entity';
import { OtpService, OtpVerificationResult } from '../otp/otp.service';
import { MailService } from '../mail/mail.service';
import { normalizeEmail } from '../otp/constants/otp.constants';
import { ERROR_MESSAGES } from '../common/constants/error-messages';
import {
  EmailAlreadyVerifiedException,
  EmailSendFailedException,
  InvalidOtpException,
  OtpExpiredException,
  OtpTooManyAttemptsException,
} from '../common/exceptions/email-verification.exception';
import { RateLimitExceededException } from '../common/exceptions/rate-limit.exception';

export interface VerificationResponse {
  success: true;
  message: string;
}

/**
 * Orchestrates the email-verification flow.
 *
 * AuthService -> EmailVerificationService -> OtpService (Redis)
 *                                        -> MailService (Nodemailer)
 *
 * The user's `username` column doubles as their email address in this system,
 * so lookups are performed against `username`.
 *
 * Enumeration strategy
 * --------------------
 * send/resend endpoints always return the same generic message regardless of
 * whether the account exists or is already verified, so an attacker cannot use
 * them to discover registered emails. Registration keeps its existing explicit
 * ConflictException because uniqueness genuinely has to be reported there, and
 * that behaviour predates this feature.
 */
@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    private readonly otpService: OtpService,
    private readonly mailService: MailService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Public entry point for send / resend. Never reveals account existence.
   */
  async requestVerificationOtp(email: string): Promise<VerificationResponse> {
    const normalized = normalizeEmail(email);

    const allowed = await this.otpService.consumeResendAllowance(normalized);

    if (!allowed) {
      throw new RateLimitExceededException(
        ERROR_MESSAGES.OTP_RATE_LIMIT_EXCEEDED,
      );
    }

    const user = await this.findByEmail(normalized);

    // Unknown or already-verified accounts short-circuit silently. The response
    // is identical to the success path so the endpoint cannot be used to probe
    // which emails are registered.
    if (!user || user.isEmailVerified) {
      this.logger.log(
        `Verification request ignored for ${normalized} (unknown or already verified)`,
      );
      return {
        success: true,
        message: ERROR_MESSAGES.VERIFICATION_EMAIL_SENT_GENERIC,
      };
    }

    await this.issueAndSend(user, normalized);

    return {
      success: true,
      message: ERROR_MESSAGES.VERIFICATION_EMAIL_SENT_GENERIC,
    };
  }

  /**
   * Used by the registration flow, where the account is known to exist and was
   * just created. Delivery failures surface directly to the caller.
   */
  async sendOtpForNewUser(user: User): Promise<void> {
    const normalized = normalizeEmail(user.username);

    await this.otpService.consumeResendAllowance(normalized);
    await this.issueAndSend(user, normalized);
  }

  async verifyEmail(email: string, otp: string): Promise<VerificationResponse> {
    const normalized = normalizeEmail(email);
    const user = await this.findByEmail(normalized);

    // A missing user is reported as an expired code rather than "not found",
    // keeping the endpoint consistent with the enumeration-safe send flow.
    if (!user) {
      throw new OtpExpiredException();
    }

    if (user.isEmailVerified) {
      throw new EmailAlreadyVerifiedException();
    }

    const result = await this.otpService.verifyOtp(normalized, otp);

    switch (result) {
      case OtpVerificationResult.EXPIRED:
        throw new OtpExpiredException();

      case OtpVerificationResult.TOO_MANY_ATTEMPTS:
        throw new OtpTooManyAttemptsException();

      case OtpVerificationResult.INVALID:
        throw new InvalidOtpException();

      case OtpVerificationResult.VALID:
        break;
    }

    user.isEmailVerified = true;
    user.emailVerifiedAt = new Date();
    await this.userRepository.save(user);

    // The code must not be reusable, and the resend allowance is released so a
    // future flow (e.g. an email change) is not blocked by this one.
    await this.otpService.clearOtp(normalized);
    await this.otpService.clearResendAllowance(normalized);

    // Drop cached profiles that embed this user so the verified flag and date
    // are not served stale (admin dashboard, linked employee, employee dashboard).
    this.eventEmitter.emit('user.changed', { userId: user.id });

    this.logger.log(`Email verified for user ${user.id}`);

    return { success: true, message: ERROR_MESSAGES.EMAIL_VERIFIED };
  }

  /**
   * Issues an OTP, stores its hash, then sends the email.
   *
   * If delivery fails the stored OTP is deleted, so a code the user can never
   * receive is not left valid in Redis.
   */
  private async issueAndSend(user: User, normalizedEmail: string) {
    const { otp } = await this.otpService.issueOtp(normalizedEmail);

    try {
      await this.mailService.sendEmailVerificationOtp(
        normalizedEmail,
        otp,
        this.otpService.getExpiresInMinutes(),
        user.firstName,
      );
    } catch (error) {
      await this.otpService.clearOtp(normalizedEmail);

      const message =
        error instanceof Error ? error.message : 'Unknown SMTP error';
      this.logger.error(
        `Verification email delivery failed for user ${user.id}: ${message}`,
      );

      // Generic failure - the underlying SMTP error never reaches the client.
      throw new EmailSendFailedException();
    }
  }

  private findByEmail(normalizedEmail: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { username: normalizedEmail },
    });
  }
}
