export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
  keyPrefix?: string;
  connectTimeout: number;
  maxRetriesPerRequest: number | null;
  enableOfflineQueue: boolean;
}

export interface RedisHealthStatus {
  status: 'up' | 'down';
  latencyMs?: number;
  error?: string;
}

export interface SessionMetadata {
  userId: string;
  sessionId: string;
  createdAt: string;
  expiresAt: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  current: number;
  remaining: number;
  ttl: number;
}
