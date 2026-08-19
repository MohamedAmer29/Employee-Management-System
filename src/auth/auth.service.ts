/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { InjectRepository } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { Employee } from '../employees/entities/employee.entity';
import { Repository } from 'typeorm';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { RegisterDto } from './dto/register.dto';
import type { Request, Response } from 'express';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditAction } from '../audit-logs/enums/audit-action.enum';
import { SessionService } from './session.service';
import { LoginProtectionService } from './login-protection.service';
import { EmailVerificationService } from './email-verification.service';
import { EmailNotVerifiedException } from '../common/exceptions/email-verification.exception';
import { CacheInvalidationService } from '../redis/cache-invalidation.service';
import { RedisService } from '../redis/redis.service';
import { breakEmployeeUserCycle } from '../common/utils/break-employee-user-cycle';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { Role } from './interfaces/Role.enum';
import { OtpVerificationResult } from '../otp/otp.service';
import { OtpService } from '../otp/otp.service';
import { OtpKeys } from '../otp/constants/otp.constants';
import { MailService } from '../mail/mail.service';
import type { StringValue } from 'ms';

const RESET_TOKEN_EXPIRES_IN_SECONDS = 15 * 60; // 15 minutes
const RESET_TOKEN_PURPOSE = 'password-reset';

const ALLOWED_PROFILE_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
];
const MAX_PROFILE_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB

export type ProfileImageFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private userRepository: Repository<User>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    private jwtService: JwtService,
    private configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    private readonly sessionService: SessionService,
    private readonly loginProtection: LoginProtectionService,
    private readonly emailVerificationService: EmailVerificationService,
    private readonly cacheInvalidation: CacheInvalidationService,
    private readonly cloudinaryService: CloudinaryService,
    private readonly otpService: OtpService,
    private readonly mailService: MailService,
    private readonly redisService: RedisService,
  ) {}

  async register(
    {
      username,
      password,
      firstName,
      lastName,
      country,
      city,
      phoneNumber,
      nationalId,
    }: RegisterDto,
    req: Request,
    file?: ProfileImageFile,
  ) {
    this.ensureNoActiveSession(req);
    if (
      !username ||
      !password ||
      !firstName ||
      !lastName ||
      !country ||
      !city ||
      !phoneNumber ||
      !nationalId
    ) {
      throw new BadRequestException('Please provide all credentials');
    }
    const user = await this.userRepository.findOneBy({ username });
    if (user) {
      throw new ConflictException('This username is already exists');
    }

    // Public registration can NEVER choose a role - everyone starts as EMPLOYEE.
    const role = Role.employee;
    const hashedPassword = await bcrypt.hash(password, 10);
    let profilePicture: string | undefined;
    if (file) {
      this.validateProfileImage(file);
      profilePicture = await this.cloudinaryService.uploadImage({
        buffer: file.buffer,
        mimetype: file.mimetype,
        originalname: file.originalname,
      });
    }

    // User and Employee are created together in one transaction so a failure
    // while saving either one rolls the whole registration back. The owning
    // side of the 1:1 relation lives on Employee (employees.userId -> users.id),
    // so the saved user is assigned through employee.user.
    const { savedUser, savedEmployee } =
      await this.userRepository.manager.transaction(async (manager) => {
        const user = manager.create(User, {
          firstName,
          lastName,
          country,
          city,
          phoneNumber,
          nationalId,
          username,
          password: hashedPassword,
          role,
          profilePicture,
          // New accounts always start unverified and must complete the OTP flow.
          isEmailVerified: false,
          emailVerifiedAt: null,
        });
        const savedUser = await manager.save(User, user);

        const employee = manager.create(Employee, {
          fullName: `${firstName} ${lastName}`,
          email: username,
          phone: phoneNumber,
          position: role,
          role,
          isActive: true,
          user: savedUser,
        });
        const savedEmployee = await manager.save(Employee, employee);

        return { savedUser, savedEmployee };
      });

    this.eventEmitter.emit('user.changed');

    this.eventEmitter.emit('audit.log.created', {
      userId: savedUser.id,
      action: AuditAction.USER_REGISTERED,
      entity: 'User',
      entityId: String(savedUser.id),
      description: 'User registered an account',
      newValues: {
        username: savedUser.username,
        role: savedUser.role,
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    });

    await this.cacheInvalidation.onEmployeeChanged(
      savedEmployee.id,
      savedUser.id,
    );

    // Send the verification code. If SMTP delivery fails the account still
    // exists and the user can request a new code via /auth/resend-verification-otp,
    // so the failure is surfaced without rolling back the registration.
    await this.emailVerificationService.sendOtpForNewUser(savedUser);

    // No token is issued here. The account is created unverified and the access
    // token (plus refresh session) is only granted once the email is verified
    // via POST /auth/verify-email - mirroring how login only issues tokens
    // after the verification gate passes.
    return {
      success: true,
      statusCode: 201,
      message:
        'Registration successful. Please check your email to verify your account.',
      data: {
        user: {
          id: savedUser.id,
          firstName: savedUser.firstName,
          lastName: savedUser.lastName,
          username: savedUser.username,
          role: savedUser.role,
          profilePicture: savedUser.profilePicture ?? null,
        },
      },
    };
  }

  /**
   * Validates an uploaded profile image: only JPEG/JPG/PNG/WEBP are accepted
   * and the file must be below the size limit. Rejects everything else so
   * arbitrary files are never stored as a profile picture.
   */
  private validateProfileImage(file: ProfileImageFile): void {
    if (!ALLOWED_PROFILE_IMAGE_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        'Profile image must be a JPEG, JPG, PNG or WEBP file',
      );
    }
    if (file.size > MAX_PROFILE_IMAGE_BYTES) {
      throw new BadRequestException('Profile image must be 2 MB or smaller');
    }
  }

  async login(
    username: string,
    password: string,
    rememberMe: boolean,
    res: Response,
    req: Request,
  ) {
    this.ensureNoActiveSession(req);

    const ip = this.resolveIp(req);
    await this.loginProtection.assertNotLocked(ip, username);

    const user = await this.userRepository.findOne({
      where: { username },
      relations: ['employee'],
    });
    if (!user) {
      await this.loginProtection.registerFailure(ip, username);
      this.eventEmitter.emit('audit.log.created', {
        action: AuditAction.LOGIN_FAILED,
        entity: 'User',
        description: 'Failed login attempt for unknown user',
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? undefined,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      await this.loginProtection.registerFailure(ip, username);
      this.eventEmitter.emit('audit.log.created', {
        userId: user.id,
        action: AuditAction.LOGIN_FAILED,
        entity: 'User',
        entityId: String(user.id),
        description: 'Failed login attempt for existing user',
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? undefined,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    // Credentials were correct, so this is not a brute-force attempt.
    await this.loginProtection.clearFailures(ip, username);

    // Block authentication for deactivated accounts. This guard runs before any
    // token is issued so a deactivated user cannot obtain a fresh session, even
    // though JwtStrategy also rejects their tokens on subsequent requests.
    if (user.isActive === false) {
      this.eventEmitter.emit('audit.log.created', {
        userId: user.id,
        action: AuditAction.LOGIN_FAILED,
        entity: 'User',
        entityId: String(user.id),
        description: 'Login blocked: account deactivated',
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? undefined,
      });
      throw new UnauthorizedException('Account is deactivated');
    }

    // Email verification gate. Checked after the password so an attacker
    // cannot use this endpoint to discover which accounts are unverified.
    // No token is issued and no session is created when this throws.
    if (!user.isEmailVerified) {
      this.eventEmitter.emit('audit.log.created', {
        userId: user.id,
        action: AuditAction.LOGIN_FAILED,
        entity: 'User',
        entityId: String(user.id),
        description: 'Login blocked: email not verified',
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? undefined,
      });

      throw new EmailNotVerifiedException();
    }

    const payload = {
      sub: user.id,
      role: user.role,
      tokenVersion: user.tokenVersion,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: this.getAccessTokenExpiresIn(),
    });

    // Embed rememberMe in the refresh token payload (signed, tamper-proof) so
    // the chosen lifetime survives later refresh-token rotations.
    await this.issueRefreshSession(
      user.id,
      { ...payload, rememberMe },
      req,
      res,
    );

    this.eventEmitter.emit('audit.log.created', {
      userId: user.id,
      action: AuditAction.LOGIN,
      entity: 'User',
      entityId: String(user.id),
      description: 'User logged in successfully',
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    });

    return { accessToken };
  }

  /**
   * Sends (or resends) an email-verification OTP.
   * Both endpoints share this implementation - the behaviour is identical and
   * the response never reveals whether the account exists.
   */
  sendVerificationOtp(email: string) {
    return this.emailVerificationService.requestVerificationOtp(email);
  }

  async verifyEmail(
    email: string,
    otp: string,
    req: Request,
    res?: Response,
  ) {
    // Throws (InvalidOtp / OtpExpired / EmailAlreadyVerified) on failure.
    await this.emailVerificationService.verifyEmail(email, otp);

    const normalized = email.toLowerCase().trim();
    const user = await this.userRepository.findOne({
      where: { username: normalized },
      relations: ['employee'],
    });
    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Verification succeeded - this is the moment the account becomes
    // authenticated, so issue the access token and a refresh session exactly
    // like login does.
    const payload = {
      sub: user.id,
      role: user.role,
      tokenVersion: user.tokenVersion,
    };
    const accessToken = this.jwtService.sign(payload, {
      expiresIn: this.getAccessTokenExpiresIn(),
    });

    if (res) {
      await this.issueRefreshSession(String(user.id), payload, req, res);
    }

    return {
      success: true,
      message: 'Email verified successfully. You are now signed in.',
      data: {
        user: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          username: user.username,
          role: user.role,
          profilePicture: user.profilePicture ?? null,
          isEmailVerified: user.isEmailVerified,
        },
        accessToken,
      },
    };
  }

  /**
   * Issues a password-reset OTP and emails it. The response is identical
   * whether or not the account exists so the endpoint cannot be used to
   * enumerate registered emails.
   */
  async forgotPassword(email: string, req: Request) {
    const normalized = email.toLowerCase().trim();
    const user = await this.userRepository.findOne({
      where: { username: normalized },
      relations: ['employee'],
    });

    if (user) {
      const { otp, expiresInSeconds } =
        await this.otpService.issuePasswordResetOtp(normalized);
      await this.mailService.sendPasswordResetOtp(
        normalized,
        otp,
        Math.max(Math.round(expiresInSeconds / 60), 1),
        user.firstName,
      );
      this.eventEmitter.emit('audit.log.created', {
        userId: user.id,
        action: AuditAction.PASSWORD_RESET_REQUESTED,
        entity: 'User',
        entityId: String(user.id),
        description: 'User requested a password reset',
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? undefined,
      });
    }

    return {
      success: true,
      message:
        'If the account exists, a password reset code has been sent to your email.',
    };
  }

  async resetPassword(
    resetToken: string,
    password: string,
    confirmPassword: string,
  ): Promise<{ success: boolean; message: string }> {
    if (password !== confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    // Tolerate a "Bearer " prefix and a missing/empty header.
    const token = resetToken?.startsWith('Bearer ')
      ? resetToken.slice('Bearer '.length)
      : resetToken;

    if (!token) {
      throw new BadRequestException(
        'Reset token is required. Send the token returned by POST /auth/verify-reset-otp in the "reset-token" request header.',
      );
    }

    let decoded: { sub: string; purpose: string; jti: string };
    try {
      decoded = this.jwtService.verify<{
        sub: string;
        purpose: string;
        jti: string;
      }>(token);
    } catch {
      throw new BadRequestException('Invalid or expired reset token');
    }

    if (decoded.purpose !== RESET_TOKEN_PURPOSE) {
      throw new BadRequestException('Invalid reset token');
    }

    // Single-use: the jti must still exist in Redis. It is deleted on first
    // successful use, so a reused or expired token is rejected.
    const resetTokenKey = OtpKeys.resetToken(decoded.jti);
    const stored = await this.redisService.get(resetTokenKey);
    if (stored === null) {
      throw new BadRequestException(
        'Reset token has already been used or has expired',
      );
    }
    await this.redisService.delete(resetTokenKey);

    const email = decoded.sub;
    const user = await this.userRepository.findOne({
      where: { username: email },
    });
    if (!user) {
      throw new BadRequestException('Invalid reset request');
    }

    user.password = await bcrypt.hash(password, 10);
    // Invalidate every existing session/token so a reset also logs out the
    // old password holder everywhere.
    user.tokenVersion += 1;
    await this.userRepository.save(user);

    this.eventEmitter.emit('audit.log.created', {
      userId: user.id,
      action: AuditAction.PASSWORD_RESET_COMPLETED,
      entity: 'User',
      entityId: String(user.id),
      description: 'User reset their password',
    });

    return { success: true, message: 'Password has been reset' };
  }

  /**
   * Validates a password-reset OTP and, on success, issues a single-use reset
   * token (a short-lived JWT carrying the email + a jti). The OTP is consumed
   * at this point so it cannot be replayed, and the reset token is tracked in
   * Redis so it can only be used once by resetPassword.
   */
  async checkResetPasswordOtp(
    email: string,
    otp: string,
  ): Promise<{
    success: boolean;
    valid: boolean;
    message: string;
    resetToken?: string;
    errorCode?: string;
  }> {
    const normalized = email.toLowerCase().trim();
    const result = await this.otpService.verifyPasswordResetOtp(
      normalized,
      otp,
    );

    switch (result) {
      case OtpVerificationResult.VALID: {
        // Consume the OTP now that it has served its purpose.
        await this.otpService.clearPasswordResetOtp(normalized);

        const jti = randomUUID();
        const resetToken = this.jwtService.sign(
          { sub: normalized, purpose: RESET_TOKEN_PURPOSE, jti },
          { expiresIn: `${RESET_TOKEN_EXPIRES_IN_SECONDS}s` },
        );

        // Single-use: the jti is deleted by resetPassword on first use.
        await this.redisService.set(
          OtpKeys.resetToken(jti),
          '1',
          RESET_TOKEN_EXPIRES_IN_SECONDS,
        );

        return {
          success: true,
          valid: true,
          message: 'OTP is valid',
          resetToken,
        };
      }
      case OtpVerificationResult.EXPIRED: {
        // The reset OTP key is absent. This most often means the email here
        // does not match the one used for forgot-password, or the user pasted
        // the email-verification code. Surface a helpful hint when a
        // verification OTP exists for the same email.
        const hasVerificationOtp =
          (await this.redisService.get(OtpKeys.otp(normalized))) !== null;

        return {
          success: false,
          valid: false,
          message: hasVerificationOtp
            ? 'This code looks like an email verification code, not a password reset code. Use the code sent in the password reset email, and make sure the email matches the one used for forgot-password.'
            : 'The reset code has expired or was not requested for this email. Please request a new one and use the same email.',
          errorCode: 'OTP_EXPIRED',
        };
      }
      case OtpVerificationResult.TOO_MANY_ATTEMPTS:
        return {
          success: false,
          valid: false,
          message: 'Too many invalid attempts. Please request a new code.',
          errorCode: 'OTP_TOO_MANY_ATTEMPTS',
        };
      case OtpVerificationResult.INVALID:
      default:
        return {
          success: false,
          valid: false,
          message: 'Invalid reset code',
          errorCode: 'INVALID_OTP',
        };
    }
  }

  async refreshToken(
    refreshToken: string | undefined,
    res: Response,
    req?: Request,
  ) {
    if (!refreshToken) {
      throw new BadRequestException('Refresh token is required');
    }

    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.getRefreshSecret(),
      });

      const user = await this.userRepository.findOne({
        where: { id: payload.sub },
      });

      if (!user) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      if (user.tokenVersion !== payload.tokenVersion) {
        throw new UnauthorizedException('Refresh token is no longer valid');
      }

      // Server-side session check. Redis is authoritative for revocation:
      // a session that was logged out cannot be refreshed even while the JWT
      // itself is still cryptographically valid.
      const sessionId: string | undefined = payload.sid;

      if (sessionId) {
        const isValidSession = await this.sessionService.validateSession(
          String(payload.sub),
          sessionId,
          refreshToken,
        );

        if (isValidSession === false) {
          throw new UnauthorizedException(
            'Session has been revoked. Please login again.',
          );
        }
      }

      user.tokenVersion += 1;
      await this.userRepository.save(user);

      const accessPayload = {
        sub: payload.sub,
        role: payload.role,
        tokenVersion: user.tokenVersion,
      };

      const accessToken = this.jwtService.sign(accessPayload, {
        expiresIn: this.getAccessTokenExpiresIn(),
      });

      // Preserve the original rememberMe choice across rotation so a 30-day
      // "remember me" session does not silently shrink to the normal lifetime.
      await this.issueRefreshSession(
        String(user.id),
        {
          ...accessPayload,
          rememberMe: (payload as { rememberMe?: boolean }).rememberMe,
        },
        req,
        res,
        sessionId,
      );

      return { message: 'Token refreshed successfully', accessToken };
    } catch (error: any) {
      throw new UnauthorizedException(
        error?.message ?? 'Invalid refresh token',
      );
    }
  }

  async currentUser(
    token: string | undefined,
  ): Promise<Omit<User, 'password'>> {
    if (!token) {
      throw new BadRequestException('Access token is required');
    }

    try {
      const payload = this.jwtService.verify(token);
      const user = await this.userRepository.findOne({
        where: { id: payload.sub },
        relations: ['employee'],
      });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      if (user.tokenVersion !== payload.tokenVersion) {
        throw new UnauthorizedException('Token is no longer valid');
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password, ...result } = user as any;
      breakEmployeeUserCycle(result.employee as { user?: unknown });
      return result;
    } catch (error: any) {
      throw new UnauthorizedException(error?.message ?? 'Invalid access token');
    }
  }

  async verifyToken(token: string | undefined) {
    if (!token) {
      throw new BadRequestException('Token is required');
    }

    try {
      const payload = this.jwtService.verify(token);

      const user = await this.userRepository.findOne({
        where: { id: payload.sub },
      });

      if (!user) {
        throw new UnauthorizedException('Invalid token');
      }

      if (user.tokenVersion !== payload.tokenVersion) {
        throw new UnauthorizedException('Token is no longer valid');
      }

      return { valid: true, payload };
    } catch (error: any) {
      throw new UnauthorizedException(error?.message ?? 'Invalid token');
    }
  }

  private ensureNoActiveSession(req: Request) {
    const hasRefreshToken = Boolean(req.cookies?.refresh_token);
    const authHeader = req.headers.authorization;
    const hasAccessToken = Boolean(
      req.cookies?.access_token || authHeader?.startsWith('Bearer '),
    );

    if (hasRefreshToken || hasAccessToken) {
      throw new ConflictException(
        'You are already authenticated. Please logout first.',
      );
    }
  }

  private getRefreshSecret() {
    return (
      this.configService.get<string>('REFRESH_SECRET') ?? 'refreshSecretKey'
    );
  }

  private getAccessTokenExpiresIn(): StringValue {
    return (this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') ??
      '15m') as StringValue;
  }

  /**
   * Returns the refresh-token lifetime string. Remember Me extends the session
   * to JWT_REFRESH_REMEMBER_EXPIRES_IN, otherwise the normal JWT_REFRESH_EXPIRES_IN
   * is used (falling back to the legacy REFRESH_EXPIRES_IN for compatibility).
   */
  private getRefreshExpiration(rememberMe: boolean): StringValue {
    if (rememberMe) {
      return (this.configService.get<string>('JWT_REFRESH_REMEMBER_EXPIRES_IN') ??
        '30d') as StringValue;
    }

    return (this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ??
      this.configService.get<string>('REFRESH_EXPIRES_IN') ??
      '1d') as StringValue;
  }

  private parseExpirationToMs(expiresIn: string): number {
    const match = /^(\d+)\s*(s|m|h|d)$/.exec(expiresIn.trim());

    if (!match) {
      return 7 * 24 * 60 * 60 * 1000;
    }

    const value = Number(match[1]);
    const unit = match[2] as 's' | 'm' | 'h' | 'd';
    const multiplier: Record<'s' | 'm' | 'h' | 'd', number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    return value * multiplier[unit];
  }

  private getRefreshTokenMaxAge(rememberMe: boolean): number {
    return this.parseExpirationToMs(this.getRefreshExpiration(rememberMe));
  }

  private getRefreshTokenTtlSeconds(rememberMe: boolean): number {
    return Math.floor(this.getRefreshTokenMaxAge(rememberMe) / 1000);
  }

  private getRefreshToken(
    payload: Record<string, unknown>,
    rememberMe: boolean,
  ): string {
    return this.jwtService.sign(payload, {
      secret: this.getRefreshSecret(),
      expiresIn: this.getRefreshExpiration(rememberMe),
    });
  }

  private resolveIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];

    if (typeof forwarded === 'string' && forwarded.length > 0) {
      return forwarded.split(',')[0].trim();
    }

    return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
  }

  /**
   * Signs a refresh token bound to a session id, registers the session in
   * Redis (hashed token only) and sets the HTTP-only refresh cookie.
   * The access token stays in the response body / access_token cookie exactly
   * as before - nothing is moved to localStorage.
   */
  private async issueRefreshSession(
    userId: string,
    payload: Record<string, unknown>,
    req: Request | undefined,
    res: Response,
    existingSessionId?: string,
  ): Promise<string> {
    const rememberMe = Boolean(
      (payload as { rememberMe?: boolean }).rememberMe,
    );
    const sessionId =
      existingSessionId ?? this.sessionService.generateSessionId();
    const ttlSeconds = this.getRefreshTokenTtlSeconds(rememberMe);
    const maxAge = this.getRefreshTokenMaxAge(rememberMe);

    const refreshToken = this.getRefreshToken(
      { ...payload, sid: sessionId },
      rememberMe,
    );

    await this.sessionService.createSession(
      {
        userId,
        refreshToken,
        ttlSeconds,
        ipAddress: req ? this.resolveIp(req) : undefined,
        userAgent: req?.get('user-agent') ?? undefined,
        rememberMe,
      },
      sessionId,
    );

    const isProd = this.configService.get<string>('NODE_ENV') === 'production';

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge,
    });

    // Readable marker so the frontend can detect a session exists without
    // touching the httpOnly refresh token. Never carries the token itself.
    res.cookie('refresh_token_present', '1', {
      httpOnly: false,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge,
    });

    return sessionId;
  }

  async logout(res: Response, req: Request) {
    const refreshToken = req.cookies?.refresh_token;
    let userId: string | undefined;
    let sessionId: string | undefined;

    if (refreshToken) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        const payload = this.jwtService.verify(refreshToken, {
          secret: this.getRefreshSecret(),
        });
        userId = payload.sub;
        sessionId = payload.sid;
      } catch {
        // Token is invalid, proceed with logout without userId
      }
    }

    // 1. Clear the HTTP-only cookies.
    res.clearCookie('refresh_token');
    res.clearCookie('refresh_token_present');
    res.clearCookie('access_token');

    // 2. Revoke the Redis session entry so the refresh token cannot be reused.
    if (userId && sessionId) {
      await this.sessionService.revokeSession(userId, sessionId);
    }

    this.eventEmitter.emit('audit.log.created', {
      userId,
      action: AuditAction.LOGOUT,
      entity: 'User',
      entityId: userId,
      description: 'User logged out',
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    });

    return { message: 'Logged out successfully' };
  }

  /**
   * Revokes every active session for the authenticated user.
   * The user's tokenVersion is also bumped so already-issued access tokens are
   * rejected immediately by JwtStrategy, even if Redis is unavailable.
   */
  async logoutAll(userId: string, res: Response, req: Request) {
    const revokedSessions = await this.sessionService.revokeAllSessions(userId);

    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (user) {
      user.tokenVersion += 1;
      await this.userRepository.save(user);
    }

    res.clearCookie('refresh_token');
    res.clearCookie('refresh_token_present');
    res.clearCookie('access_token');

    this.eventEmitter.emit('audit.log.created', {
      userId,
      action: AuditAction.LOGOUT,
      entity: 'User',
      entityId: userId,
      description: 'User logged out from all devices',
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    });

    return {
      message: 'Logged out from all devices successfully',
      revokedSessions,
    };
  }

  /**
   * Lists the active Redis sessions for the authenticated user.
   * Only non-sensitive metadata is returned.
   */
  async getActiveSessions(userId: string) {
    const sessions = await this.sessionService.listSessions(userId);

    return {
      total: sessions.length,
      sessions,
    };
  }
}
