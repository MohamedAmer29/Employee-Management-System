import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyTokenDto } from './dto/verify-token.dto';
import { SendVerificationOtpDto } from './dto/send-verification-otp.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import type { Request, Response } from 'express';
import { JwtGuard } from './guards/jwt.gaurd';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';
import { RateLimit } from '../common/decorators/rate-limit.decorator';
import { RATE_LIMIT_DEFAULTS } from '../redis/redis.constants';
import { OTP_DEFAULTS } from '../otp/constants/otp.constants';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  @UseGuards(RateLimitGuard)
  @RateLimit({
    scope: 'auth:register',
    limit: RATE_LIMIT_DEFAULTS.REGISTER_MAX_ATTEMPTS,
    windowSeconds: RATE_LIMIT_DEFAULTS.REGISTER_WINDOW_SECONDS,
  })
  @ApiOperation({
    summary: 'Register a new account',
    description:
      'Creates the account with isEmailVerified=false and emails a verification code. No access token is issued until the email is verified.',
  })
  @ApiResponse({
    status: 201,
    description: 'Registration successful, verification email sent',
    schema: {
      example: {
        success: true,
        message:
          'Registration successful. Please check your email to verify your account.',
      },
    },
  })
  @ApiResponse({ status: 409, description: 'Username already exists' })
  @ApiResponse({
    status: 500,
    description: 'Verification email could not be sent',
    schema: {
      example: {
        success: false,
        statusCode: 500,
        message: 'Unable to send verification email',
        errorCode: 'EMAIL_SEND_FAILED',
      },
    },
  })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.register(dto, req, res);
  }

  @Post('login')
  @UseGuards(RateLimitGuard)
  @RateLimit({
    scope: 'auth:login',
    limit: RATE_LIMIT_DEFAULTS.LOGIN_MAX_ATTEMPTS,
    windowSeconds: RATE_LIMIT_DEFAULTS.LOGIN_WINDOW_SECONDS,
    trackBodyField: 'username',
  })
  @ApiOperation({
    summary: 'Login',
    description:
      'Authenticates the user. Requires a verified email address; unverified accounts are rejected with EMAIL_NOT_VERIFIED and receive no token.',
  })
  @ApiResponse({ status: 201, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({
    status: 403,
    description: 'Email address has not been verified',
    schema: {
      example: {
        success: false,
        statusCode: 403,
        message: 'Please verify your email before logging in',
        errorCode: 'EMAIL_NOT_VERIFIED',
      },
    },
  })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request,
  ) {
    const result = await this.authService.login(
      dto.username,
      dto.password,
      res,
      req,
    );

    const date = new Date();
    return {
      date: date.toUTCString(),
      message: 'Login successful',
      accessToken: result.accessToken,
    };
  }

  @Post('send-verification-otp')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  @RateLimit({
    scope: 'auth:send-verification-otp',
    limit: OTP_DEFAULTS.MAX_RESEND_REQUESTS,
    windowSeconds: OTP_DEFAULTS.RESEND_WINDOW_SECONDS,
    trackBodyField: 'email',
  })
  @ApiOperation({
    summary: 'Send an email-verification code',
    description:
      'Emails a 6-digit verification code. The response is intentionally identical whether or not the account exists, to prevent email enumeration. Limited to 3 requests per 15 minutes per email and per IP.',
  })
  @ApiResponse({
    status: 200,
    description: 'Request accepted',
    schema: {
      example: {
        success: true,
        message: 'If the account exists, a verification email has been sent.',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed',
    schema: {
      example: {
        success: false,
        statusCode: 400,
        message: 'Validation failed',
        errorCode: 'VALIDATION_ERROR',
        errors: [{ field: 'email', messages: ['email must be an email'] }],
      },
    },
  })
  @ApiResponse({
    status: 429,
    description: 'Too many verification requests',
    schema: {
      example: {
        success: false,
        statusCode: 429,
        message: 'Too many verification requests. Please try again later.',
        errorCode: 'RATE_LIMIT_EXCEEDED',
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Verification email could not be sent',
    schema: {
      example: {
        success: false,
        statusCode: 500,
        message: 'Unable to send verification email',
        errorCode: 'EMAIL_SEND_FAILED',
      },
    },
  })
  sendVerificationOtp(@Body() dto: SendVerificationOtpDto) {
    return this.authService.sendVerificationOtp(dto.email);
  }

  @Post('resend-verification-otp')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  @RateLimit({
    scope: 'auth:resend-verification-otp',
    limit: OTP_DEFAULTS.MAX_RESEND_REQUESTS,
    windowSeconds: OTP_DEFAULTS.RESEND_WINDOW_SECONDS,
    trackBodyField: 'email',
  })
  @ApiOperation({
    summary: 'Resend the email-verification code',
    description:
      'Issues a new verification code and invalidates the previous one. Shares the DTO, rate limit and enumeration-safe response of send-verification-otp.',
  })
  @ApiResponse({
    status: 200,
    description: 'Request accepted',
    schema: {
      example: {
        success: true,
        message: 'If the account exists, a verification email has been sent.',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({
    status: 429,
    description: 'Too many verification requests',
    schema: {
      example: {
        success: false,
        statusCode: 429,
        message: 'Too many verification requests. Please try again later.',
        errorCode: 'RATE_LIMIT_EXCEEDED',
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Unable to send verification email',
  })
  resendVerificationOtp(@Body() dto: SendVerificationOtpDto) {
    return this.authService.sendVerificationOtp(dto.email);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  @RateLimit({
    scope: 'auth:verify-email',
    limit: 10,
    windowSeconds: OTP_DEFAULTS.RESEND_WINDOW_SECONDS,
    trackBodyField: 'email',
  })
  @ApiOperation({
    summary: 'Verify an email address with an OTP',
    description:
      'Validates the 6-digit code against the hash stored in Redis. On success the account is marked verified and the code is deleted. Allows 5 failed attempts before the code is invalidated.',
  })
  @ApiResponse({
    status: 200,
    description: 'Email verified successfully',
    schema: {
      example: { success: true, message: 'Email verified successfully' },
    },
  })
  @ApiResponse({
    status: 400,
    description:
      'Validation failed, code expired, code invalid, or email already verified',
    schema: {
      examples: {
        invalidOtp: {
          summary: 'Invalid code',
          value: {
            success: false,
            statusCode: 400,
            message: 'Invalid verification code',
            errorCode: 'INVALID_OTP',
          },
        },
        expiredOtp: {
          summary: 'Expired code',
          value: {
            success: false,
            statusCode: 400,
            message: 'Verification code has expired',
            errorCode: 'OTP_EXPIRED',
          },
        },
        alreadyVerified: {
          summary: 'Already verified',
          value: {
            success: false,
            statusCode: 400,
            message: 'Email is already verified',
            errorCode: 'EMAIL_ALREADY_VERIFIED',
          },
        },
        validationError: {
          summary: 'Validation failed',
          value: {
            success: false,
            statusCode: 400,
            message: 'Validation failed',
            errorCode: 'VALIDATION_ERROR',
            errors: [
              { field: 'otp', messages: ['otp must contain exactly 6 digits'] },
            ],
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 429,
    description: 'Too many invalid attempts',
    schema: {
      example: {
        success: false,
        statusCode: 429,
        message:
          'Too many invalid attempts. Please request a new verification code.',
        errorCode: 'OTP_TOO_MANY_ATTEMPTS',
      },
    },
  })
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.email, dto.otp);
  }

  @Post('verify-token')
  verifyToken(@Body() dto: VerifyTokenDto) {
    return this.authService.verifyToken(dto.token);
  }

  @Post('refresh-token')
  @UseGuards(RateLimitGuard)
  @RateLimit({
    scope: 'auth:refresh',
    limit: RATE_LIMIT_DEFAULTS.REFRESH_MAX_ATTEMPTS,
    windowSeconds: RATE_LIMIT_DEFAULTS.REFRESH_WINDOW_SECONDS,
  })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  refreshToken(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.refresh_token as string | undefined;
    return this.authService.refreshToken(refreshToken, res, req);
  }

  @Post('current-user')
  currentUser(@Body() dto: VerifyTokenDto) {
    return this.authService.currentUser(dto.token);
  }

  @Post('logout')
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.authService.logout(res, req);
  }

  @Post('logout-all')
  @UseGuards(JwtGuard)
  @ApiBearerAuth('Authorization')
  @ApiOperation({
    summary: 'Logout from all devices',
    description:
      'Revokes every active Redis session for the authenticated user and invalidates all previously issued tokens.',
  })
  @ApiResponse({ status: 200, description: 'All sessions revoked' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  logoutAll(
    @CurrentUser('userId') userId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.logoutAll(userId, res, req);
  }

  @Get('sessions')
  @UseGuards(JwtGuard)
  @ApiBearerAuth('Authorization')
  @ApiOperation({
    summary: 'List active sessions',
    description:
      'Returns the active Redis sessions for the authenticated user. No tokens or credentials are exposed.',
  })
  @ApiResponse({ status: 200, description: 'Active sessions retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getSessions(@CurrentUser('userId') userId: string) {
    return this.authService.getActiveSessions(userId);
  }
}
