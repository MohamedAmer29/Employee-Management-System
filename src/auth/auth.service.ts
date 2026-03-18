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
import * as bcrypt from 'bcrypt';
import { RegisterDto } from './dto/register.dto';
import type { Response } from 'express';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private userRepository: Repository<User>,
    private jwtService: JwtService,
  ) {}

  async register({ username, password, role }: RegisterDto) {
    if (!username || !password || !role) {
      throw new BadRequestException('Please Provide all credentials');
    }
    const user = await this.userRepository.findOneBy({ username });
    if (user) {
      throw new ConflictException('This username is already exists');
    }
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = this.userRepository.create({
      username: username,
      password: hashedPassword,
      role: role,
    });

    // user.employee.isActive = true;
    await this.userRepository.save(newUser);

    return { message: 'User registered successfully' };
  }

  async login(username: string, password: string, res: Response) {
    const user = await this.userRepository.findOne({
      where: { username },
      relations: ['employee'],
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) throw new UnauthorizedException('Invalid credentials');

    const payload = {
      user: user.id,
      role: user.role,
    };

    res.cookie('access_token', this.jwtService.sign(payload), {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 2,
    });
  }

  logout(res: Response) {
    res.clearCookie('access_token');
    return { message: 'Logged out successfully' };
  }
}
