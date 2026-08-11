import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { Role } from '../auth/interfaces/Role.enum';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

import * as bcrypt from 'bcrypt';

const mockBcryptHash = bcrypt.hash as jest.Mock;

describe('UsersService', () => {
  let service: UsersService;
  let userRepository: {
    findOne: jest.Mock;
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    remove: jest.Mock;
  };
  let cloudinaryService: {
    uploadImage: jest.Mock;
    deleteImage: jest.Mock;
  };

  const user = {
    id: 'user-1',
    firstName: 'Jane',
    lastName: 'Doe',
    country: 'USA',
    city: 'Denver',
    phoneNumber: '5551234567',
    nationalId: '987654321',
    username: 'janedoe',
    password: 'hashed',
    role: Role.employee,
    tokenVersion: 0,
    isActive: true,
  } as unknown as User;

  beforeEach(async () => {
    userRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
    };
    cloudinaryService = {
      uploadImage: jest.fn(),
      deleteImage: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: CloudinaryService, useValue: cloudinaryService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should hash the password and save the user', async () => {
      mockBcryptHash.mockResolvedValue('hashed-password');
      userRepository.create.mockReturnValue(user);
      userRepository.save.mockResolvedValue(user);

      const dto = {
        firstName: 'Jane',
        lastName: 'Doe',
        country: 'USA',
        city: 'Denver',
        phoneNumber: '5551234567',
        nationalId: '987654321',
        username: 'janedoe',
        password: 'Password123',
        role: Role.employee,
      };

      const result = await service.create(dto);

      expect(bcrypt.hash).toHaveBeenCalledWith('Password123', 10);
      expect(userRepository.save).toHaveBeenCalledWith(user);
      expect(result).toBe(user);
    });
  });

  describe('findAll', () => {
    it('should return all users with employee relation without passwords', async () => {
      userRepository.find.mockResolvedValue([user]);

      const result = await service.findAll();

      expect(userRepository.find).toHaveBeenCalledWith({
        relations: ['employee'],
      });
      expect(result[0]).not.toHaveProperty('password');
      expect(result[0]).toMatchObject({
        id: 'user-1',
        username: 'janedoe',
      });
    });
  });

  describe('findOne', () => {
    it('should return the user without the password when found', async () => {
      userRepository.findOne.mockResolvedValue(user);

      const result = await service.findOne('user-1');

      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        relations: ['employee'],
      });
      expect(result).not.toHaveProperty('password');
      expect(result).toMatchObject({ id: 'user-1' });
    });

    it('should throw NotFoundException when user not found', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update the user and save', async () => {
      userRepository.findOne.mockResolvedValue({ ...user });
      userRepository.save.mockResolvedValue({ ...user, city: 'Cairo' });

      const result = await service.update('user-1', { city: 'Cairo' } as any);

      expect(userRepository.save).toHaveBeenCalled();
      expect(result).toMatchObject({ city: 'Cairo' });
    });
  });

  describe('updateProfile', () => {
    it('should only update allowed profile fields', async () => {
      userRepository.findOne.mockResolvedValue({ ...user });
      userRepository.save.mockResolvedValue({ ...user, firstName: 'John' });

      const result = await service.updateProfile('user-1', {
        firstName: 'John',
      } as any);

      expect(userRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ firstName: 'John' }),
      );
      expect(result.firstName).toBe('John');
    });
  });

  describe('resetPassword', () => {
    it('should throw BadRequestException when passwords do not match', async () => {
      userRepository.findOne.mockResolvedValue(user);

      await expect(
        service.resetPassword('user-1', {
          password: 'NewPassword123',
          confirmPassword: 'DifferentPassword',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should hash the new password and bump the token version', async () => {
      userRepository.findOne.mockResolvedValue({ ...user, tokenVersion: 0 });
      mockBcryptHash.mockResolvedValue('new-hash');
      userRepository.save.mockResolvedValue({
        ...user,
        password: 'new-hash',
        tokenVersion: 1,
      });

      const result = await service.resetPassword('user-1', {
        password: 'NewPassword123',
        confirmPassword: 'NewPassword123',
      } as any);

      expect(bcrypt.hash).toHaveBeenCalledWith('NewPassword123', 10);
      expect(result.tokenVersion).toBe(1);
    });
  });

  describe('deactivate / activate', () => {
    it('should deactivate a user', async () => {
      userRepository.findOne.mockResolvedValue({ ...user, isActive: true });
      userRepository.save.mockResolvedValue({ ...user, isActive: false });

      const result = await service.deactivate('user-1');

      expect(result.isActive).toBe(false);
    });

    it('should activate a user', async () => {
      userRepository.findOne.mockResolvedValue({ ...user, isActive: false });
      userRepository.save.mockResolvedValue({ ...user, isActive: true });

      const result = await service.activate('user-1');

      expect(result.isActive).toBe(true);
    });
  });

  describe('uploadProfilePicture', () => {
    const file = {
      originalname: 'photo.png',
      mimetype: 'image/png',
      buffer: Buffer.from('fake-image'),
      size: 10,
    };

    it('should upload to Cloudinary and store the URL on the user', async () => {
      const userWithPicture = {
        ...user,
        profilePicture:
          'https://res.cloudinary.com/dvak5lwwy/image/upload/v1/old.jpg',
      } as unknown as User;

      userRepository.findOne.mockResolvedValue(userWithPicture);
      cloudinaryService.uploadImage.mockResolvedValue(
        'https://res.cloudinary.com/dvak5lwwy/image/upload/v1/profile-pictures/new.jpg',
      );
      userRepository.save.mockResolvedValue({
        ...userWithPicture,
        profilePicture:
          'https://res.cloudinary.com/dvak5lwwy/image/upload/v1/profile-pictures/new.jpg',
      });

      const result = await service.uploadProfilePicture('user-1', file);

      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'user-1' },
      });
      expect(cloudinaryService.uploadImage).toHaveBeenCalledWith(file);
      expect(cloudinaryService.deleteImage).toHaveBeenCalledWith(
        'https://res.cloudinary.com/dvak5lwwy/image/upload/v1/old.jpg',
      );
      expect(userRepository.save).toHaveBeenCalled();
      expect(result.profilePicture).toContain('res.cloudinary.com');
      expect(result).not.toHaveProperty('password');
    });

    it('should throw NotFoundException when the user does not exist', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(
        service.uploadProfilePicture('missing', file),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should remove the user and return a message', async () => {
      userRepository.findOne.mockResolvedValue(user);
      userRepository.remove.mockResolvedValue(user);

      const result = await service.remove('user-1');

      expect(userRepository.remove).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'user-1' }),
      );
      expect(result).toEqual({ message: 'User deleted' });
    });
  });
});
