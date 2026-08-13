import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '@/users/entities/user.entity';
import { Employee } from '@/employees/entities/employee.entity';
import { CacheInvalidationService } from '@/redis/cache-invalidation.service';
import { LeaveCreatedEvent } from '@/common/events/leave-created.event';
import { LeaveApprovedEvent } from '@/common/events/leave-approved.event';
import { LeaveRejectedEvent } from '@/common/events/leave-rejected.event';
import { PerformanceReviewCreatedEvent } from '@/common/events/performance-review-created.event';
import { EmployeeUpdatedEvent } from '@/common/events/employee-updated.event';
import { AttendanceRecordedEvent } from '@/common/events/attendance-recorded.event';

/**
 * Listens to the existing domain events and invalidates only the dashboard
 * caches that are actually affected. Nothing else in the event pipeline is
 * changed - notifications and audit logs keep their own listeners.
 */
@Injectable()
export class DashboardCacheListener {
  constructor(
    private readonly cacheInvalidation: CacheInvalidationService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
  ) {}

  @OnEvent('attendance.recorded')
  async handleAttendanceRecorded(event: AttendanceRecordedEvent) {
    await this.cacheInvalidation.onEmployeeActivity(event.userId);
  }

  @OnEvent('leave.created')
  async handleLeaveCreated(event: LeaveCreatedEvent) {
    await this.cacheInvalidation.onEmployeeActivity(event.userId);
  }

  @OnEvent('leave.approved')
  async handleLeaveApproved(event: LeaveApprovedEvent) {
    await this.cacheInvalidation.onEmployeeActivity(event.userId);
  }

  @OnEvent('leave.rejected')
  async handleLeaveRejected(event: LeaveRejectedEvent) {
    await this.cacheInvalidation.onEmployeeActivity(event.userId);
  }

  @OnEvent('performance.created')
  async handlePerformanceCreated(event: PerformanceReviewCreatedEvent) {
    await this.cacheInvalidation.onEmployeeActivity(event.userId);
  }

  @OnEvent('employee.updated')
  async handleEmployeeUpdated(event: EmployeeUpdatedEvent) {
    await this.cacheInvalidation.onEmployeeActivity(event.userId);
  }

  /**
   * Fired when a user account is created, activated, deactivated, deleted or
   * has its email verified. The admin dashboard counts users as employees, so
   * any user mutation must drop the cached admin dashboard. When a user id is
   * provided, the linked employee's cached profile is also dropped so fields
   * like `isEmailVerified` / `emailVerifiedAt` are not served stale.
   */
  @OnEvent('user.changed')
  async handleUserChanged(payload?: { userId?: string | number }) {
    await this.cacheInvalidation.invalidateAdminDashboard();

    if (payload?.userId == null) {
      return;
    }

    const employee = await this.employeeRepository
      .createQueryBuilder('employee')
      .innerJoin('employee.user', 'user')
      .where('user.id = :userId', { userId: Number(payload.userId) })
      .getOne();

    if (!employee) {
      return;
    }

    await this.cacheInvalidation.invalidateEmployee(String(employee.id));
    await this.cacheInvalidation.invalidateEmployeeDashboard(
      String(payload.userId),
    );
  }

  @OnEvent('notification.created')
  async handleNotificationCreated(payload: { userId: string }) {
    if (!payload?.userId) {
      return;
    }

    const user = await this.userRepository.findOne({
      where: { id: payload.userId },
    });

    if (!user) {
      return;
    }

    // The unread counter itself is maintained by NotificationsService; only the
    // dashboard snapshot that embeds it needs to be dropped here.
    await this.cacheInvalidation.invalidateEmployeeDashboard(payload.userId);
  }
}
