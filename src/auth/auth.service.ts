/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { InjectRepository } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
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
import { RegisterDto } from './dto/register.dto';
import type { Request, Response } from 'express';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditAction } from '../audit-logs/enums/audit-action.enum';
import { SessionService } from './session.service';
import { LoginProtectionService } from './login-protection.service';
import { EmailVerificationService } from './email-verification.service';
import { EmailNotVerifiedException } from '../common/exceptions/email-verification.exception';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private userRepository: Repository<User>,
    private jwtService: JwtService,
    private configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    private readonly sessionService: SessionService,
    private readonly loginProtection: LoginProtectionService,
    private readonly emailVerificationService: EmailVerificationService,
  ) {}

  async register(
    {
      username,
      password,
      role,
      firstName,
      lastName,
      country,
      city,
      phoneNumber,
      nationalId,
    }: RegisterDto,
    req: Request,
    res: Response,
  ) {
    this.ensureNoActiveSession(req);
    if (
      !username ||
      !password ||
      !role ||
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
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = this.userRepository.create({
      firstName,
      lastName,
      country,
      city,
      phoneNumber,
      nationalId,
      username,
      password: hashedPassword,
      role,
    });

    // New accounts always start unverified and must complete the OTP flow.
    newUser.isEmailVerified = false;
    newUser.emailVerifiedAt = null;

    // user.employee.isActive = true;
    await this.userRepository.save(newUser);

    this.eventEmitter.emit('user.changed');

    this.eventEmitter.emit('audit.log.created', {
      userId: newUser.id,
      action: AuditAction.CREATE,
      entity: 'User',
      entityId: String(newUser.id),
      description: 'User registered an account',
      newValues: {
        username: newUser.username,
        role: newUser.role,
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    });

    // Send the verification code. If SMTP delivery fails the account still
    // exists and the user can request a new code via /auth/resend-verification-otp,
    // so the failure is surfaced without rolling back the registration.
    await this.emailVerificationService.sendOtpForNewUser(newUser);

    // No tokens are issued here - the user is not authenticated until their
    // email has been verified.
    return {
      success: true,
      message:
        'Registration successful. Please check your email to verify your account.',
    };
  }

  async login(username: string, password: string, res: Response, req: Request) {
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
      expiresIn: '15m',
    });

    await this.issueRefreshSession(user.id, payload, req, res);

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

  verifyEmail(email: string, otp: string) {
    return this.emailVerificationService.verifyEmail(email, otp);
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
        expiresIn: '15m',
      });

      await this.issueRefreshSession(
        String(user.id),
        accessPayload,
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

  private getRefreshTokenExpiresIn() {
    return this.configService.get<string>('REFRESH_EXPIRES_IN') ?? '7d';
  }

  private getRefreshToken(payload: Record<string, unknown>) {
    const expiresIn = this.getRefreshTokenExpiresIn();

    return this.jwtService.sign(payload, {
      secret: this.getRefreshSecret(),
      expiresIn: expiresIn as any,
    });
  }

  private getRefreshTokenMaxAge() {
    const expiresIn = this.getRefreshTokenExpiresIn();

    if (expiresIn.endsWith('d')) {
      const days = Number(expiresIn.slice(0, -1));
      return days * 24 * 60 * 60 * 1000;
    }

    return 7 * 24 * 60 * 60 * 1000;
  }

  private getRefreshTokenTtlSeconds(): number {
    return Math.floor(this.getRefreshTokenMaxAge() / 1000);
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
    const sessionId =
      existingSessionId ?? this.sessionService.generateSessionId();
    const ttlSeconds = this.getRefreshTokenTtlSeconds();

    const refreshToken = this.getRefreshToken({ ...payload, sid: sessionId });

    await this.sessionService.createSession(
      {
        userId,
        refreshToken,
        ttlSeconds,
        ipAddress: req ? this.resolveIp(req) : undefined,
        userAgent: req?.get('user-agent') ?? undefined,
      },
      sessionId,
    );

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: this.getRefreshTokenMaxAge(),
    });

    // Readable marker so the frontend can detect a session exists without
    // touching the httpOnly refresh token. Never carries the token itself.
    res.cookie('refresh_token_present', '1', {
      httpOnly: false,
      secure: false,
      sameSite: 'lax',
      maxAge: this.getRefreshTokenMaxAge(),
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
