import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { User } from '../users/entities/user.entity';
import { Role } from './interfaces/Role.enum';

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

import * as bcrypt from 'bcrypt';

const mockBcryptHash = bcrypt.hash as jest.Mock;
const mockBcryptCompare = bcrypt.compare as jest.Mock;

describe('AuthService', () => {
  let service: AuthService;
  let userRepository: {
    findOneBy: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let jwtService: { sign: jest.Mock; verify: jest.Mock };
  let configService: { get: jest.Mock };
  let eventEmitter: { emit: jest.Mock };

  const user = {
    id: 'user-1',
    firstName: 'Jane',
    lastName: 'Doe',
    username: 'janedoe',
    password: 'hashed-password',
    role: Role.employee,
    tokenVersion: 0,
    isActive: true,
  } as unknown as User;

  const res = {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  };

  const req = {
    ip: '::1',
    cookies: {},
    headers: {},
    get: jest.fn(),
  } as any;

  beforeEach(async () => {
    userRepository = {
      findOneBy: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    jwtService = { sign: jest.fn(), verify: jest.fn() };
    configService = { get: jest.fn() };
    eventEmitter = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('register', () => {
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

    it('should register a new user and return an access token', async () => {
      userRepository.findOneBy.mockResolvedValue(null);
      mockBcryptHash.mockResolvedValue('hashed-password');
      userRepository.create.mockReturnValue(user);
      userRepository.save.mockResolvedValue(user);
      jwtService.sign.mockReturnValue('access-token');

      const result = await service.register(dto, req, res as any);

      expect(userRepository.findOneBy).toHaveBeenCalledWith({
        username: 'janedoe',
      });
      expect(userRepository.save).toHaveBeenCalled();
      expect(jwtService.sign).toHaveBeenCalled();
      expect(res.cookie).toHaveBeenCalledWith(
        'refresh_token',
        expect.any(String),
        expect.any(Object),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'audit.log.created',
        expect.objectContaining({ entity: 'User' }),
      );
      expect(result).toEqual({
        message: 'User registered successfully',
        accessToken: 'access-token',
      });
    });

    it('should throw BadRequestException when credentials are missing', async () => {
      const incomplete = { ...dto, username: '' } as any;

      await expect(
        service.register(incomplete, req, res as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException when username already exists', async () => {
      userRepository.findOneBy.mockResolvedValue(user);

      await expect(service.register(dto, req, res as any)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw ConflictException when a session is already active', async () => {
      const authedReq = {
        ...req,
        cookies: { refresh_token: 'some-token' },
      };

      await expect(
        service.register(dto, authedReq, res as any),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('should login successfully and return an access token', async () => {
      userRepository.findOne.mockResolvedValue(user);
      mockBcryptCompare.mockResolvedValue(true);
      jwtService.sign.mockReturnValue('access-token');

      const result = await service.login(
        'janedoe',
        'Password123',
        res as any,
        req,
      );

      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { username: 'janedoe' },
        relations: ['employee'],
      });
      expect(res.cookie).toHaveBeenCalledWith(
        'refresh_token',
        expect.any(String),
        expect.any(Object),
      );
      expect(eventEmitter.emit).toHaveBeenCalled();
      expect(result).toEqual({ accessToken: 'access-token' });
    });

    it('should throw UnauthorizedException for unknown username', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(
        service.login('unknown', 'Password123', res as any, req),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      userRepository.findOne.mockResolvedValue(user);
      mockBcryptCompare.mockResolvedValue(false);

      await expect(
        service.login('janedoe', 'wrong-password', res as any, req),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refreshToken', () => {
    it('should throw BadRequestException when refresh token is missing', async () => {
      await expect(service.refreshToken(undefined, res as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should refresh tokens successfully', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-1',
        role: Role.employee,
        tokenVersion: 0,
      });
      userRepository.findOne.mockResolvedValue({ ...user, tokenVersion: 0 });
      userRepository.save.mockResolvedValue({ ...user, tokenVersion: 1 });
      jwtService.sign.mockReturnValue('new-access-token');

      const result = await service.refreshToken('refresh-token', res as any);

      expect(userRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ tokenVersion: 1 }),
      );
      expect(res.cookie).toHaveBeenCalled();
      expect(result).toEqual({
        message: 'Token refreshed successfully',
        accessToken: 'new-access-token',
      });
    });

    it('should throw UnauthorizedException when user no longer exists', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-1',
        role: Role.employee,
        tokenVersion: 0,
      });
      userRepository.findOne.mockResolvedValue(null);

      await expect(
        service.refreshToken('refresh-token', res as any),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when token version changed', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-1',
        role: Role.employee,
        tokenVersion: 0,
      });
      userRepository.findOne.mockResolvedValue({ ...user, tokenVersion: 5 });

      await expect(
        service.refreshToken('refresh-token', res as any),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when verification fails', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });

      await expect(
        service.refreshToken('invalid-token', res as any),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('currentUser', () => {
    it('should return the user without the password', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-1',
        role: Role.employee,
        tokenVersion: 0,
      });
      userRepository.findOne.mockResolvedValue(user);

      const result = await service.currentUser('access-token');

      expect(result).not.toHaveProperty('password');
      expect(result).toHaveProperty('id', 'user-1');
    });

    it('should throw BadRequestException when token is missing', async () => {
      await expect(service.currentUser(undefined)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw UnauthorizedException when user is not found', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-1',
        role: Role.employee,
        tokenVersion: 0,
      });
      userRepository.findOne.mockResolvedValue(null);

      await expect(service.currentUser('access-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when token version changed', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-1',
        role: Role.employee,
        tokenVersion: 0,
      });
      userRepository.findOne.mockResolvedValue({ ...user, tokenVersion: 9 });

      await expect(service.currentUser('access-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('verifyToken', () => {
    it('should return valid true for a valid token', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-1',
        role: Role.employee,
        tokenVersion: 0,
      });
      userRepository.findOne.mockResolvedValue(user);

      const result = await service.verifyToken('valid-token');

      expect(result).toEqual({ valid: true, payload: expect.any(Object) });
    });

    it('should throw BadRequestException when token is missing', async () => {
      await expect(service.verifyToken(undefined)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw UnauthorizedException for an invalid token', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('invalid');
      });

      await expect(service.verifyToken('bad-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when user is not found', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-1',
        role: Role.employee,
        tokenVersion: 0,
      });
      userRepository.findOne.mockResolvedValue(null);

      await expect(service.verifyToken('valid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('should clear the refresh cookie and return a message', () => {
      const result = service.logout(res as any, req);

      expect(res.clearCookie).toHaveBeenCalledWith('refresh_token');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'audit.log.created',
        expect.objectContaining({ action: expect.any(String) }),
      );
      expect(result).toEqual({ message: 'Logged out successfully' });
    });
  });
});
