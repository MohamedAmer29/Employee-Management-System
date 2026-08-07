import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './notification.entity';
import { CreateNotificationDto } from './dto/create-notification.dto';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
  ) {}

  async create(dto: CreateNotificationDto) {
    const notification = this.notificationRepository.create(dto);
    const saved = await this.notificationRepository.save(notification);

    return {
      success: true,
      message: 'Notification created successfully',
      data: saved,
    };
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

    notification.isRead = true;
    notification.readAt = new Date();
    await this.notificationRepository.save(notification);

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

    return {
      success: true,
      message: 'All notifications marked as read',
      data: [],
    };
  }

  async delete(id: string, userId: string) {
    const result = await this.notificationRepository.delete({ id, userId });

    if (!result.affected) {
      throw new NotFoundException('Notification not found');
    }

    return {
      success: true,
      message: 'Notification deleted successfully',
      data: [],
    };
  }
}
