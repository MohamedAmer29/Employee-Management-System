import { ConfigService } from '@nestjs/config';
import { RedisConfig } from '../redis/interfaces/redis-config.interface';

export const getRedisConfig = (configService: ConfigService): RedisConfig => {
  const password = configService.get<string>('REDIS_PASSWORD');

  const tlsEnabled =
    configService.get<string>('REDIS_TLS') === 'true' ||
    configService.get<string>('REDIS_PORT') === '6380';

  return {
    host: configService.get<string>('REDIS_HOST') ?? 'localhost',
    port: Number(configService.get<string>('REDIS_PORT') ?? 6379),
    password: password && password.trim().length > 0 ? password : undefined,
    db: Number(configService.get<string>('REDIS_DB') ?? 0),
    keyPrefix: configService.get<string>('REDIS_KEY_PREFIX') ?? undefined,
    connectTimeout: Number(
      configService.get<string>('REDIS_CONNECT_TIMEOUT') ?? 10000,
    ),
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false,
    tls: tlsEnabled ? { rejectUnauthorized: false } : undefined,
  };
};
