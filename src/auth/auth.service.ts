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

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private userRepository: Repository<User>,
    private jwtService: JwtService,
    private configService: ConfigService,
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

    // user.employee.isActive = true;
    await this.userRepository.save(newUser);

    const payload = {
      sub: newUser.id,
      role: newUser.role,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: '15m',
    });

    res.cookie('refresh_token', this.getRefreshToken(payload), {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: this.getRefreshTokenMaxAge(),
    });

    return {
      message: 'User registered successfully',
      accessToken,
    };
  }

  async login(username: string, password: string, res: Response, req: Request) {
    this.ensureNoActiveSession(req);
    const user = await this.userRepository.findOne({
      where: { username },
      relations: ['employee'],
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) throw new UnauthorizedException('Invalid credentials');

    const payload = {
      sub: user.id,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: '15m',
    });

    res.cookie('refresh_token', this.getRefreshToken(payload), {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: this.getRefreshTokenMaxAge(),
    });

    return { accessToken };
  }

  refreshToken(refreshToken: string | undefined, res: Response) {
    if (!refreshToken) {
      throw new BadRequestException('Refresh token is required');
    }

    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.getRefreshSecret(),
      });

      const accessPayload = {
        sub: payload.sub,
        role: payload.role,
      };

      const accessToken = this.jwtService.sign(accessPayload, {
        expiresIn: '15m',
      });

      res.cookie('refresh_token', this.getRefreshToken(accessPayload), {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        maxAge: this.getRefreshTokenMaxAge(),
      });

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

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password, ...result } = user as any;
      return result;
    } catch (error: any) {
      throw new UnauthorizedException(error?.message ?? 'Invalid access token');
    }
  }

  verifyToken(token: string | undefined) {
    if (!token) {
      throw new BadRequestException('Token is required');
    }

    try {
      const payload = this.jwtService.verify(token);
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

  logout(res: Response) {
    res.clearCookie('refresh_token');
    return { message: 'Logged out successfully' };
  }
}
