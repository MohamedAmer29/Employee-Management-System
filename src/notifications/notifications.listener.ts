import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationType } from './enums/notification-type.enum';
import { NotificationsService } from './notifications.service';
import { User } from '@/users/entities/user.entity';
import { Role } from '@/auth/interfaces/Role.enum';
import { LeaveCreatedEvent } from '@/common/events/leave-created.event';
import { LeaveApprovedEvent } from '@/common/events/leave-approved.event';
import { LeaveRejectedEvent } from '@/common/events/leave-rejected.event';
import { PerformanceReviewCreatedEvent } from '@/common/events/performance-review-created.event';
import { EmployeeUpdatedEvent } from '@/common/events/employee-updated.event';

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
  async handleLeaveCreated(event: LeaveCreatedEvent) {
    const recipients = await this.userRepository.find({
      where: [{ role: Role.manager }, { role: Role.admin }],
    });

    await Promise.all(
      recipients.map((recipient) =>
        this.notificationsService.create({
          userId: recipient.id,
          type: NotificationType.LEAVE_REQUEST,
          title: 'New leave request',
          message: `${event.employeeName} submitted a new leave request.`,
        }),
      ),
    );
  }

  @OnEvent('leave.approved')
  async handleLeaveApproved(event: LeaveApprovedEvent) {
    await this.notificationsService.create({
      userId: event.userId,
      type: NotificationType.LEAVE_APPROVED,
      title: 'Leave request approved',
      message: 'Your leave request has been approved.',
    });
  }

  @OnEvent('leave.rejected')
  async handleLeaveRejected(event: LeaveRejectedEvent) {
    await this.notificationsService.create({
      userId: event.userId,
      type: NotificationType.LEAVE_REJECTED,
      title: 'Leave request rejected',
      message: event.rejectionReason
        ? `Your leave request has been rejected: ${event.rejectionReason}`
        : 'Your leave request has been rejected.',
    });
  }

  @OnEvent('performance.created')
  async handlePerformanceCreated(event: PerformanceReviewCreatedEvent) {
    await this.notificationsService.create({
      userId: event.userId,
      type: NotificationType.PERFORMANCE_REVIEW,
      title: 'New performance review',
      message: 'A new performance review is available.',
    });
  }

  @OnEvent('employee.updated')
  async handleEmployeeUpdated(event: EmployeeUpdatedEvent) {
    await this.notificationsService.create({
      userId: event.userId,
      type: NotificationType.EMPLOYEE_UPDATE,
      title: 'Employee information updated',
      message: 'Your employee information has been updated.',
    });
  }
}
