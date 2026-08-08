import { Global, Logger, Module, Provider } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';
import { RedisService } from './redis.service';
import { CacheInvalidationService } from './cache-invalidation.service';
import { getRedisConfig } from '../config/redis.config';

const redisClientProvider: Provider = {
  provide: REDIS_CLIENT,
  inject: [ConfigService],
  useFactory: (configService: ConfigService): Redis => {
    const logger = new Logger('RedisClient');
    const config = getRedisConfig(configService);

    const client = new Redis({
      host: config.host,
      port: config.port,
      password: config.password,
      db: config.db,
      keyPrefix: config.keyPrefix,
      connectTimeout: config.connectTimeout,
      maxRetriesPerRequest: config.maxRetriesPerRequest,
      enableOfflineQueue: config.enableOfflineQueue,
      lazyConnect: false,
      retryStrategy: (times: number): number => Math.min(times * 500, 10000),
      reconnectOnError: (error: Error): boolean =>
        error.message.includes('READONLY'),
    });

    client.on('connect', () => {
      logger.log(`Connecting to Redis at ${config.host}:${config.port}`);
    });

    client.on('ready', () => {
      logger.log(`Redis connection established (db ${config.db})`);
    });

    client.on('error', (error: Error) => {
      logger.warn(`Redis error: ${error.message}`);
    });

    client.on('reconnecting', () => {
      logger.warn('Reconnecting to Redis...');
    });

    client.on('end', () => {
      logger.warn('Redis connection closed');
    });

    return client;
  },
};

@Global()
@Module({
  imports: [ConfigModule],
  providers: [redisClientProvider, RedisService, CacheInvalidationService],
  exports: [RedisService, CacheInvalidationService, REDIS_CLIENT],
})
export class RedisModule {}
