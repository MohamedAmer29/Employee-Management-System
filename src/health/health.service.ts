import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RedisService } from '../redis/redis.service';

export interface HealthReport {
  database: 'up' | 'down';
  redis: 'up' | 'down';
  degraded: boolean;
  details: {
    redis?: { latencyMs?: number; error?: string };
    database?: { error?: string };
  };
}

/**
 * Reports the liveness of both backing stores.
 *
 * PostgreSQL being down is a hard failure. Redis being down is a *degraded*
 * state: the API keeps serving requests directly from PostgreSQL.
 */
@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly redisService: RedisService,
  ) {}

  async check(): Promise<HealthReport> {
    const [database, redis] = await Promise.all([
      this.checkDatabase(),
      this.redisService.ping(),
    ]);

    return {
      database: database.status,
      redis: redis.status,
      degraded: database.status === 'up' && redis.status === 'down',
      details: {
        database: database.error ? { error: database.error } : undefined,
        redis:
          redis.status === 'up'
            ? { latencyMs: redis.latencyMs }
            : { error: redis.error },
      },
    };
  }

  private async checkDatabase(): Promise<{
    status: 'up' | 'down';
    error?: string;
  }> {
    try {
      if (!this.dataSource.isInitialized) {
        return { status: 'down', error: 'DataSource is not initialized' };
      }

      await this.dataSource.query('SELECT 1');
      return { status: 'up' };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown database error';
      this.logger.error(`Database health check failed: ${message}`);
      return { status: 'down', error: message };
    }
  }
}
