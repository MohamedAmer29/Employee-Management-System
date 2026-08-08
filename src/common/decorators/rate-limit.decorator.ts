import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rate_limit_options';

export interface RateLimitOptions {
  /** Logical bucket name used in the Redis key, e.g. "auth:login". */
  scope: string;
  /** Maximum number of requests allowed inside the window. */
  limit: number;
  /** Sliding window length in seconds. */
  windowSeconds: number;
  /**
   * Additional body field to include in the identifier (e.g. "username"),
   * so brute force against a single account is limited independently of IP.
   */
  trackBodyField?: string;
}

export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, options);
