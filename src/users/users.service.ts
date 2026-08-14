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
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { breakEmployeeUserCycle } from '../common/utils/break-employee-user-cycle';

type UploadedProfilePictureFile = {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
};

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private userRepository: Repository<User>,
    private readonly eventEmitter: EventEmitter2,
    private readonly cloudinaryService: CloudinaryService,
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
    return this.userRepository
      .find({ relations: ['employee'] })
      .then((users) => users.map((user) => this.sanitizeUser(user)));
  }

  async findOne(id: string) {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['employee'],
    });
    if (!user) throw new NotFoundException('User not found');
    return this.sanitizeUser(user);
  }

  /**
   * Removes the password hash before a user object leaves the service. Never
   * strip the nested employee relation - it is loaded through the TypeORM
   * relationship (user.employee) and is safe to expose.
   */
  private sanitizeUser(user: User): User {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...safeUser } = user;
    breakEmployeeUserCycle(safeUser.employee);
    return safeUser as User;
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

  /**
   * Uploads a profile picture for the given user to Cloudinary and stores the
   * secure URL. Any previous image is removed from Cloudinary so orphaned
   * assets do not accumulate. The user table is the single source of truth
   * for profile pictures.
   */
  async uploadProfilePicture(userId: string, file: UploadedProfilePictureFile) {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const profilePicture = await this.cloudinaryService.uploadImage(file);

    if (user.profilePicture) {
      await this.cloudinaryService.deleteImage(user.profilePicture);
    }

    user.profilePicture = profilePicture;
    const saved = await this.userRepository.save(user);
    this.eventEmitter.emit('user.changed');

    return this.sanitizeUser(saved);
  }

  async remove(id: string) {
    const user = await this.findOne(id);
    await this.userRepository.remove(user);
    this.eventEmitter.emit('user.changed');
    return { message: 'User deleted' };
  }
}
