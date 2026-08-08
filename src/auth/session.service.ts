import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { RedisService } from '../redis/redis.service';
import { RedisKeys } from '../redis/redis.constants';
import { SessionMetadata } from '../redis/interfaces/redis-config.interface';

export interface CreateSessionInput {
  userId: string;
  refreshToken: string;
  ttlSeconds: number;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Server-side refresh-token / session state backed by Redis.
 *
 * Only a SHA-256 hash of the refresh token is persisted - never the raw token,
 * never a password and never a JWT secret. Each session is tracked in a per
 * user set so "logout from all devices" can revoke everything at once.
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(private readonly redisService: RedisService) {}

  generateSessionId(): string {
    return randomUUID();
  }

  async createSession(
    input: CreateSessionInput,
    sessionId: string = this.generateSessionId(),
  ): Promise<string> {
    const { userId, refreshToken, ttlSeconds, ipAddress, userAgent } = input;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    const metadata: SessionMetadata = {
      userId,
      sessionId,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      ipAddress,
      userAgent,
    };

    await Promise.all([
      this.redisService.set(
        RedisKeys.refreshToken(userId, sessionId),
        this.hashToken(refreshToken),
        ttlSeconds,
      ),
      this.redisService.setJson(
        RedisKeys.userSession(userId, sessionId),
        metadata,
        ttlSeconds,
      ),
      this.redisService.addToSet(RedisKeys.userSessions(userId), sessionId),
    ]);

    await this.redisService.expire(RedisKeys.userSessions(userId), ttlSeconds);

    return sessionId;
  }

  /**
   * Validates a presented refresh token against the stored hash.
   * Returns false when the session was revoked, expired or never existed.
   * When Redis is unavailable this returns null so the caller can decide to
   * fall back to stateless JWT verification instead of locking users out.
   */
  async validateSession(
    userId: string,
    sessionId: string,
    refreshToken: string,
  ): Promise<boolean | null> {
    if (!this.redisService.isAvailable()) {
      return null;
    }

    const storedHash = await this.redisService.get(
      RedisKeys.refreshToken(userId, sessionId),
    );

    if (!storedHash) {
      return false;
    }

    return storedHash === this.hashToken(refreshToken);
  }

  /**
   * Rotates a session in place: the session id is preserved while the stored
   * token hash and expiry are replaced.
   */
  async rotateSession(
    userId: string,
    sessionId: string,
    newRefreshToken: string,
    ttlSeconds: number,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    await this.createSession(
      {
        userId,
        refreshToken: newRefreshToken,
        ttlSeconds,
        ipAddress,
        userAgent,
      },
      sessionId,
    );
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    await Promise.all([
      this.redisService.delete(
        RedisKeys.refreshToken(userId, sessionId),
        RedisKeys.userSession(userId, sessionId),
      ),
      this.redisService.removeFromSet(
        RedisKeys.userSessions(userId),
        sessionId,
      ),
    ]);
  }

  async revokeAllSessions(userId: string): Promise<number> {
    const sessionIds = await this.redisService.getSetMembers(
      RedisKeys.userSessions(userId),
    );

    if (sessionIds.length === 0) {
      await this.redisService.delete(RedisKeys.userSessions(userId));
      return 0;
    }

    const keys = sessionIds.flatMap((sessionId) => [
      RedisKeys.refreshToken(userId, sessionId),
      RedisKeys.userSession(userId, sessionId),
    ]);

    await this.redisService.delete(...keys, RedisKeys.userSessions(userId));

    this.logger.log(
      `Revoked ${sessionIds.length} session(s) for user ${userId}`,
    );

    return sessionIds.length;
  }

  async listSessions(userId: string): Promise<SessionMetadata[]> {
    const sessionIds = await this.redisService.getSetMembers(
      RedisKeys.userSessions(userId),
    );

    const sessions = await Promise.all(
      sessionIds.map((sessionId) =>
        this.redisService.getJson<SessionMetadata>(
          RedisKeys.userSession(userId, sessionId),
        ),
      ),
    );

    return sessions.filter(
      (session): session is SessionMetadata => session !== null,
    );
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
