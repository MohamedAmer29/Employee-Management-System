import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyTokenDto } from './dto/verify-token.dto';
import type { Request, Response } from 'express';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.register(dto, req, res);
  }

  @Post('login')
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
  refreshToken(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.refresh_token as string | undefined;
    return this.authService.refreshToken(refreshToken, res);
  }

  @Post('current-user')
  currentUser(@Body() dto: VerifyTokenDto) {
    return this.authService.currentUser(dto.token);
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    return this.authService.logout(res);
  }
}
