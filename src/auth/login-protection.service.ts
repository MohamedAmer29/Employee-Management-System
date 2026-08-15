import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { CACHE_TTL, RedisKeys } from '../redis/redis.constants';
import { RateLimitExceededException } from '../common/exceptions/rate-limit.exception';

const MAX_FAILED_ATTEMPTS = 999;

/**
 * Brute-force protection for the login endpoint.
 *
 * Failed attempts are counted per IP and per username with a TTL, so a
 * temporary restriction always expires on its own and legitimate users are
 * never permanently blocked. Passwords are never written to Redis.
 */
@Injectable()
export class LoginProtectionService {
  private readonly logger = new Logger(LoginProtectionService.name);

  constructor(private readonly redisService: RedisService) {}

  async assertNotLocked(ip: string, username: string): Promise<void> {
    if (!this.redisService.isAvailable()) {
      return;
    }

    const [ipAttempts, usernameAttempts] = await Promise.all([
      this.getAttempts(RedisKeys.loginAttemptsByIp(ip)),
      this.getAttempts(RedisKeys.loginAttemptsByEmail(username)),
    ]);

    if (ipAttempts >= MAX_FAILED_ATTEMPTS) {
      throw new RateLimitExceededException(
        'Too many failed login attempts from this address. Please try again later.',
      );
    }

    if (usernameAttempts >= MAX_FAILED_ATTEMPTS) {
      throw new RateLimitExceededException(
        'Too many failed login attempts for this account. Please try again later.',
      );
    }
  }

  async registerFailure(ip: string, username: string): Promise<void> {
    await Promise.all([
      this.redisService.incrementWithTtl(
        RedisKeys.loginAttemptsByIp(ip),
        CACHE_TTL.LOGIN_ATTEMPTS,
      ),
      this.redisService.incrementWithTtl(
        RedisKeys.loginAttemptsByEmail(username),
        CACHE_TTL.LOGIN_ATTEMPTS,
      ),
    ]);
  }

  async clearFailures(ip: string, username: string): Promise<void> {
    await this.redisService.delete(
      RedisKeys.loginAttemptsByIp(ip),
      RedisKeys.loginAttemptsByEmail(username),
    );
  }

  private async getAttempts(key: string): Promise<number> {
    const value = await this.redisService.get(key);

    if (value === null) {
      return 0;
    }

    const parsed = Number(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
}
