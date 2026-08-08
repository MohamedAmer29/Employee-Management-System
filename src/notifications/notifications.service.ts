import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './notification.entity';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { RedisService } from '../redis/redis.service';
import { CACHE_TTL, RedisKeys } from '../redis/redis.constants';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    private readonly redisService: RedisService,
  ) {}

  async create(dto: CreateNotificationDto) {
    const notification = this.notificationRepository.create(dto);
    const saved = await this.notificationRepository.save(notification);

    await this.bumpUnreadCount(dto.userId);

    return {
      success: true,
      message: 'Notification created successfully',
      data: saved,
    };
  }

  /**
   * Unread count read path. Redis holds a short-lived counter for speed but
   * PostgreSQL remains authoritative: if the Redis key is missing the count is
   * recalculated from the database and re-cached.
   */
  async getUnreadCount(userId: string) {
    const key = RedisKeys.notificationsUnread(userId);
    const cached = await this.redisService.get(key);

    if (cached !== null) {
      const parsed = Number(cached);

      if (!Number.isNaN(parsed) && parsed >= 0) {
        return {
          success: true,
          message: 'Unread notification count retrieved successfully',
          data: { unread: parsed },
        };
      }
    }

    const unread = await this.notificationRepository.count({
      where: { userId, isRead: false },
    });

    await this.redisService.set(
      key,
      String(unread),
      CACHE_TTL.NOTIFICATIONS_UNREAD,
    );

    return {
      success: true,
      message: 'Unread notification count retrieved successfully',
      data: { unread },
    };
  }

  /**
   * Increments the cached counter only when it already exists, so a stale value
   * is never created out of thin air. When the key is absent the next read
   * recalculates it from PostgreSQL.
   */
  private async bumpUnreadCount(userId: string): Promise<void> {
    const key = RedisKeys.notificationsUnread(userId);

    if (await this.redisService.exists(key)) {
      await this.redisService.increment(key);
      return;
    }

    await this.redisService.delete(key);
  }

  private async decrementUnreadCount(userId: string): Promise<void> {
    const key = RedisKeys.notificationsUnread(userId);

    if (!(await this.redisService.exists(key))) {
      return;
    }

    const value = await this.redisService.decrement(key);

    if (value !== null && value < 0) {
      await this.redisService.set(key, '0', CACHE_TTL.NOTIFICATIONS_UNREAD);
    }
  }

  async findAllForUser(userId: string, page = 1, limit = 20) {
    const [data, total] = await this.notificationRepository.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      success: true,
      message: 'Notifications retrieved successfully',
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findUnread(userId: string, page = 1, limit = 20) {
    const [data, total] = await this.notificationRepository.findAndCount({
      where: { userId, isRead: false },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      success: true,
      message: 'Unread notifications retrieved successfully',
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async markAsRead(id: string, userId: string) {
    const notification = await this.notificationRepository.findOne({
      where: { id, userId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    const wasUnread = !notification.isRead;

    notification.isRead = true;
    notification.readAt = new Date();
    await this.notificationRepository.save(notification);

    if (wasUnread) {
      await this.decrementUnreadCount(userId);
    }

    return {
      success: true,
      message: 'Notification marked as read',
      data: notification,
    };
  }

  async markAllAsRead(userId: string) {
    await this.notificationRepository.update(
      { userId, isRead: false },
      { isRead: true, readAt: new Date() },
    );

    await this.redisService.set(
      RedisKeys.notificationsUnread(userId),
      '0',
      CACHE_TTL.NOTIFICATIONS_UNREAD,
    );

    return {
      success: true,
      message: 'All notifications marked as read',
      data: [],
    };
  }

  async delete(id: string, userId: string) {
    const notification = await this.notificationRepository.findOne({
      where: { id, userId },
    });

    const result = await this.notificationRepository.delete({ id, userId });

    if (!result.affected) {
      throw new NotFoundException('Notification not found');
    }

    if (notification && !notification.isRead) {
      await this.decrementUnreadCount(userId);
    }

    return {
      success: true,
      message: 'Notification deleted successfully',
      data: [],
    };
  }
}
