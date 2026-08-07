import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import { User } from '../users/entities/user.entity';
import { Role } from './interfaces/Role.enum';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let userRepository: { findOne: jest.Mock };

  const user = {
    id: 'user-1',
    role: Role.employee,
    tokenVersion: 1,
    isActive: true,
  } as unknown as User;

  beforeEach(() => {
    userRepository = { findOne: jest.fn() };
    const configService = {
      getOrThrow: jest.fn().mockReturnValue('test-secret'),
    } as unknown as ConfigService;

    strategy = new JwtStrategy(configService, userRepository as any);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  describe('validate', () => {
    const payload = {
      sub: 'user-1',
      role: Role.employee,
      tokenVersion: 1,
    };

    it('should return the user id and role for a valid payload', async () => {
      userRepository.findOne.mockResolvedValue(user);

      const result = await strategy.validate(payload);

      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'user-1' },
      });
      expect(result).toEqual({ userId: 'user-1', role: Role.employee });
    });

    it('should throw UnauthorizedException when user is not found', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(strategy.validate(payload)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when account is deactivated', async () => {
      userRepository.findOne.mockResolvedValue({ ...user, isActive: false });

      await expect(strategy.validate(payload)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when token version changed', async () => {
      userRepository.findOne.mockResolvedValue({ ...user, tokenVersion: 5 });

      await expect(strategy.validate(payload)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
