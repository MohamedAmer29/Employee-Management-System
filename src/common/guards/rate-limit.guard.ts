import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { RedisService } from '../../redis/redis.service';
import { RedisKeys } from '../../redis/redis.constants';
import {
  RATE_LIMIT_KEY,
  RateLimitOptions,
} from '../decorators/rate-limit.decorator';
import { RateLimitExceededException } from '../exceptions/rate-limit.exception';

/**
 * Distributed rate limiting backed by Redis.
 *
 * Because counters live in Redis rather than process memory, the limits are
 * enforced consistently across every backend instance. If Redis is down the
 * guard fails open (requests are allowed) so authentication never becomes
 * completely unavailable because of a cache outage.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly redisService: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!options) {
      return true;
    }

    if (!this.redisService.isAvailable()) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    const identifiers = this.buildIdentifiers(request, options);

    for (const identifier of identifiers) {
      const key = RedisKeys.rateLimit(options.scope, identifier);
      const result = await this.redisService.consumeRateLimit(
        key,
        options.limit,
        options.windowSeconds,
      );

      response.setHeader('X-RateLimit-Limit', options.limit);
      response.setHeader('X-RateLimit-Remaining', result.remaining);

      if (!result.allowed) {
        const retryAfter = result.ttl > 0 ? result.ttl : options.windowSeconds;
        response.setHeader('Retry-After', retryAfter);
        throw new RateLimitExceededException();
      }
    }

    return true;
  }

  private buildIdentifiers(
    request: Request,
    options: RateLimitOptions,
  ): string[] {
    const identifiers = [this.resolveIp(request)];

    if (options.trackBodyField) {
      const body = request.body as Record<string, unknown> | undefined;
      const value = body?.[options.trackBodyField];

      if (typeof value === 'string' && value.trim().length > 0) {
        identifiers.push(`field:${value.trim().toLowerCase()}`);
      }
    }

    return identifiers;
  }

  private resolveIp(request: Request): string {
    const forwarded = request.headers['x-forwarded-for'];

    if (typeof forwarded === 'string' && forwarded.length > 0) {
      return `ip:${forwarded.split(',')[0].trim()}`;
    }

    return `ip:${request.ip ?? request.socket.remoteAddress ?? 'unknown'}`;
  }
}
