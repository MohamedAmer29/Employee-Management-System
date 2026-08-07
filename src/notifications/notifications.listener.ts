import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationType } from './enums/notification-type.enum';
import { NotificationsService } from './notifications.service';
import { User } from '@/users/entities/user.entity';
import { Role } from '@/auth/interfaces/Role.enum';

@Injectable()
export class NotificationsListener {
  constructor(
    private readonly notificationsService: NotificationsService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  @OnEvent('notification.created')
  async handleNotificationCreated(payload: {
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
  }) {
    await this.notificationsService.create({
      userId: payload.userId,
      type: payload.type,
      title: payload.title,
      message: payload.message,
    });
  }

  @OnEvent('leave.created')
  async handleLeaveCreated(payload: { userId: string; employeeId: string }) {
    const recipients = await this.userRepository.find({
      where: [{ role: Role.manager }, { role: Role.admin }],
    });

    await Promise.all(
      recipients.map((recipient) =>
        this.notificationsService.create({
          userId: recipient.id,
          type: NotificationType.LEAVE_REQUEST,
          title: 'New leave request',
          message: 'A new leave request has been submitted.',
        }),
      ),
    );
  }

  @OnEvent('performance.created')
  async handlePerformanceCreated(payload: { userId: string }) {
    await this.notificationsService.create({
      userId: payload.userId,
      type: NotificationType.PERFORMANCE_REVIEW,
      title: 'New performance review',
      message: 'A new performance review is available.',
    });
  }
}
