import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleDestroy,
} from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';
import {
  RateLimitResult,
  RedisHealthStatus,
} from './interfaces/redis-config.interface';

@Injectable()
export class RedisService implements OnModuleDestroy, OnApplicationShutdown {
  private readonly logger = new Logger(RedisService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  isAvailable(): boolean {
    return this.client.status === 'ready';
  }

  getClient(): Redis {
    return this.client;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      if (ttlSeconds && ttlSeconds > 0) {
        await this.client.set(key, value, 'EX', ttlSeconds);
      } else {
        await this.client.set(key, value);
      }
      return true;
    } catch (error) {
      this.logFailure('set', key, error);
      return false;
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.isAvailable()) {
      return null;
    }

    try {
      return await this.client.get(key);
    } catch (error) {
      this.logFailure('get', key, error);
      return null;
    }
  }

  async setJson<T>(
    key: string,
    value: T,
    ttlSeconds?: number,
  ): Promise<boolean> {
    try {
      return await this.set(key, JSON.stringify(value), ttlSeconds);
    } catch (error) {
      this.logFailure('setJson', key, error);
      return false;
    }
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.get(key);

    if (raw === null) {
      return null;
    }

    try {
      return JSON.parse(raw) as T;
    } catch (error) {
      this.logFailure('getJson:parse', key, error);
      await this.delete(key);
      return null;
    }
  }

  /**
   * Cache-aside helper: returns the cached value when present, otherwise runs
   * the loader (PostgreSQL) and stores the result. Redis failures never
   * propagate - the loader result is always returned.
   */
  async remember<T>(
    key: string,
    ttlSeconds: number,
    loader: () => Promise<T>,
  ): Promise<T> {
    const cached = await this.getJson<T>(key);

    if (cached !== null) {
      return cached;
    }

    const fresh = await loader();

    if (fresh !== null && fresh !== undefined) {
      await this.setJson(key, fresh, ttlSeconds);
    }

    return fresh;
  }

  /**
   * Cache-aside with stampede protection. Only one caller rebuilds the cache
   * while the others briefly wait for the freshly written value.
   */
  async rememberWithLock<T>(
    key: string,
    lockKey: string,
    ttlSeconds: number,
    loader: () => Promise<T>,
    lockTtlSeconds = 10,
    waitMs = 750,
  ): Promise<T> {
    const cached = await this.getJson<T>(key);

    if (cached !== null) {
      return cached;
    }

    if (!this.isAvailable()) {
      return loader();
    }

    const hasLock = await this.acquireLock(lockKey, lockTtlSeconds);

    if (!hasLock) {
      const awaited = await this.waitForKey<T>(key, waitMs);

      if (awaited !== null) {
        return awaited;
      }

      return loader();
    }

    try {
      const fresh = await loader();

      if (fresh !== null && fresh !== undefined) {
        await this.setJson(key, fresh, ttlSeconds);
      }

      return fresh;
    } finally {
      await this.releaseLock(lockKey);
    }
  }

  async delete(...keys: string[]): Promise<number> {
    if (!this.isAvailable() || keys.length === 0) {
      return 0;
    }

    try {
      return await this.client.del(...keys);
    } catch (error) {
      this.logFailure('delete', keys.join(','), error);
      return 0;
    }
  }

  async exists(key: string): Promise<boolean> {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      this.logFailure('exists', key, error);
      return false;
    }
  }

  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      const result = await this.client.expire(key, ttlSeconds);
      return result === 1;
    } catch (error) {
      this.logFailure('expire', key, error);
      return false;
    }
  }

  async ttl(key: string): Promise<number> {
    if (!this.isAvailable()) {
      return -2;
    }

    try {
      return await this.client.ttl(key);
    } catch (error) {
      this.logFailure('ttl', key, error);
      return -2;
    }
  }

  async increment(key: string, by = 1): Promise<number | null> {
    if (!this.isAvailable()) {
      return null;
    }

    try {
      return await this.client.incrby(key, by);
    } catch (error) {
      this.logFailure('increment', key, error);
      return null;
    }
  }

  async decrement(key: string, by = 1): Promise<number | null> {
    if (!this.isAvailable()) {
      return null;
    }

    try {
      return await this.client.decrby(key, by);
    } catch (error) {
      this.logFailure('decrement', key, error);
      return null;
    }
  }

  async incrementWithTtl(
    key: string,
    ttlSeconds: number,
  ): Promise<{ count: number; ttl: number } | null> {
    if (!this.isAvailable()) {
      return null;
    }

    try {
      const results = await this.client.multi().incr(key).ttl(key).exec();

      if (!results) {
        return null;
      }

      const count = Number(results[0]?.[1] ?? 0);
      let ttl = Number(results[1]?.[1] ?? -1);

      if (ttl < 0) {
        await this.client.expire(key, ttlSeconds);
        ttl = ttlSeconds;
      }

      return { count, ttl };
    } catch (error) {
      this.logFailure('incrementWithTtl', key, error);
      return null;
    }
  }

  async consumeRateLimit(
    key: string,
    maxAttempts: number,
    windowSeconds: number,
  ): Promise<RateLimitResult> {
    const result = await this.incrementWithTtl(key, windowSeconds);

    if (result === null) {
      return {
        allowed: true,
        current: 0,
        remaining: maxAttempts,
        ttl: 0,
      };
    }

    return {
      allowed: result.count <= maxAttempts,
      current: result.count,
      remaining: Math.max(maxAttempts - result.count, 0),
      ttl: result.ttl,
    };
  }

  async deleteByPattern(pattern: string): Promise<number> {
    if (!this.isAvailable()) {
      return 0;
    }

    try {
      let cursor = '0';
      let deleted = 0;

      do {
        const [nextCursor, keys] = await this.client.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          200,
        );

        cursor = nextCursor;

        if (keys.length > 0) {
          deleted += await this.client.del(...keys);
        }
      } while (cursor !== '0');

      return deleted;
    } catch (error) {
      this.logFailure('deleteByPattern', pattern, error);
      return 0;
    }
  }

  async addToSet(key: string, ...members: string[]): Promise<number> {
    if (!this.isAvailable() || members.length === 0) {
      return 0;
    }

    try {
      return await this.client.sadd(key, ...members);
    } catch (error) {
      this.logFailure('addToSet', key, error);
      return 0;
    }
  }

  async removeFromSet(key: string, ...members: string[]): Promise<number> {
    if (!this.isAvailable() || members.length === 0) {
      return 0;
    }

    try {
      return await this.client.srem(key, ...members);
    } catch (error) {
      this.logFailure('removeFromSet', key, error);
      return 0;
    }
  }

  async getSetMembers(key: string): Promise<string[]> {
    if (!this.isAvailable()) {
      return [];
    }

    try {
      return await this.client.smembers(key);
    } catch (error) {
      this.logFailure('getSetMembers', key, error);
      return [];
    }
  }

  async acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      const result = await this.client.set(
        key,
        Date.now().toString(),
        'EX',
        ttlSeconds,
        'NX',
      );
      return result === 'OK';
    } catch (error) {
      this.logFailure('acquireLock', key, error);
      return false;
    }
  }

  async releaseLock(key: string): Promise<void> {
    await this.delete(key);
  }

  async ping(): Promise<RedisHealthStatus> {
    if (this.client.status !== 'ready' && this.client.status !== 'connecting') {
      return { status: 'down', error: `Client status: ${this.client.status}` };
    }

    const startedAt = Date.now();

    try {
      const reply: string = await this.client.ping();

      if (reply !== 'PONG') {
        return { status: 'down', error: `Unexpected reply: ${reply}` };
      }

      return { status: 'up', latencyMs: Date.now() - startedAt };
    } catch (error) {
      return {
        status: 'down',
        error: error instanceof Error ? error.message : 'Unknown Redis error',
      };
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.closeConnection();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.closeConnection();
  }

  private async closeConnection(): Promise<void> {
    if (this.client.status === 'end') {
      return;
    }

    try {
      await this.client.quit();
      this.logger.log('Redis connection closed gracefully');
    } catch {
      this.client.disconnect();
      this.logger.warn('Redis connection force-closed');
    }
  }

  private async waitForKey<T>(
    key: string,
    maxWaitMs: number,
  ): Promise<T | null> {
    const intervalMs = 50;
    const attempts = Math.max(Math.floor(maxWaitMs / intervalMs), 1);

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));

      const value = await this.getJson<T>(key);

      if (value !== null) {
        return value;
      }
    }

    return null;
  }

  private logFailure(operation: string, key: string, error: unknown): void {
    const message =
      error instanceof Error ? error.message : 'Unknown Redis error';
    this.logger.warn(`Redis ${operation} failed for "${key}": ${message}`);
  }
}
