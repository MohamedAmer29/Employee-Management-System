/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import * as bcrypt from 'bcrypt';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RegisterDto } from '../auth/dto/register.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private userRepository: Repository<User>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(dto: RegisterDto) {
    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const user = this.userRepository.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      country: dto.country,
      city: dto.city,
      phoneNumber: dto.phoneNumber,
      nationalId: dto.nationalId,
      username: dto.username,
      password: hashedPassword,
      role: dto.role,
    });

    const saved = await this.userRepository.save(user);
    this.eventEmitter.emit('user.changed');
    return saved;
  }

  findAll() {
    return this.userRepository.find({ relations: ['employee'] });
  }

  async findOne(id: string) {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['employee'],
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async update(id: string, dto: UpdateUserDto) {
    const user = await this.findOne(id);

    Object.assign(user, dto as any);
    return this.userRepository.save(user);
  }

  async updateProfile(id: string, dto: UpdateProfileDto) {
    const user = await this.findOne(id);

    const allowedFields = [
      'firstName',
      'lastName',
      'country',
      'city',
      'phoneNumber',
    ] as const;

    allowedFields.forEach((field) => {
      if (dto[field] !== undefined) {
        (user as any)[field] = dto[field];
      }
    });

    return this.userRepository.save(user);
  }

  async resetPassword(id: string, dto: ResetPasswordDto) {
    const user = await this.findOne(id);

    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException(
        'Password and confirm password do not match',
      );
    }

    user.password = await bcrypt.hash(dto.password, 10);
    // invalidate previous tokens
    user.tokenVersion = (user.tokenVersion || 0) + 1;

    return this.userRepository.save(user);
  }

  async deactivate(id: string) {
    const user = await this.findOne(id);

    user.isActive = false;
    const saved = await this.userRepository.save(user);
    this.eventEmitter.emit('user.changed');
    return saved;
  }

  async activate(id: string) {
    const user = await this.findOne(id);

    user.isActive = true;
    const saved = await this.userRepository.save(user);
    this.eventEmitter.emit('user.changed');
    return saved;
  }

  async remove(id: string) {
    const user = await this.findOne(id);
    await this.userRepository.remove(user);
    this.eventEmitter.emit('user.changed');
    return { message: 'User deleted' };
  }
}
