import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyTokenDto } from './dto/verify-token.dto';
import type { Request, Response } from 'express';
import { JwtGuard } from './guards/jwt.gaurd';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';
import { RateLimit } from '../common/decorators/rate-limit.decorator';
import { RATE_LIMIT_DEFAULTS } from '../redis/redis.constants';

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
