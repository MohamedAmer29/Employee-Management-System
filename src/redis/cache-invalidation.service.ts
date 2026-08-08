import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from './redis.service';
import { RedisKeys } from './redis.constants';

/**
 * Centralised, targeted cache invalidation.
 *
 * Every method only removes the keys that are actually affected by a change -
 * the cache is never flushed wholesale. All calls are best-effort: when Redis
 * is unavailable the underlying RedisService silently no-ops and PostgreSQL
 * stays authoritative.
 */
@Injectable()
export class CacheInvalidationService {
  private readonly logger = new Logger(CacheInvalidationService.name);

  constructor(private readonly redisService: RedisService) {}

  async invalidateEmployee(employeeId: string): Promise<void> {
    await this.redisService.delete(
      RedisKeys.employee(employeeId),
      RedisKeys.employeesList(),
    );
  }

  async invalidateEmployeesList(): Promise<void> {
    await this.redisService.delete(RedisKeys.employeesList());
  }

  async invalidateDepartment(departmentId: string): Promise<void> {
    await this.redisService.delete(
      RedisKeys.department(departmentId),
      RedisKeys.departmentsList(),
    );
  }

  async invalidateDepartmentsList(): Promise<void> {
    await this.redisService.delete(RedisKeys.departmentsList());
  }

  async invalidateAdminDashboard(): Promise<void> {
    await this.redisService.delete(RedisKeys.dashboardAdmin());
    await this.redisService.deleteByPattern('dashboard:admin:*');
  }

  async invalidateManagerDashboard(userId: string): Promise<void> {
    await this.redisService.delete(RedisKeys.dashboardManager(userId));
  }

  /**
   * Used when a change affects a department but the owning manager user id is
   * not known at the call site. Manager dashboards use a 60s TTL and there are
   * few of them, so a scoped pattern delete is cheap and keeps data correct.
   */
  async invalidateAllManagerDashboards(): Promise<void> {
    await this.redisService.deleteByPattern(
      RedisKeys.dashboardManagerPattern(),
    );
  }

  async invalidateEmployeeDashboard(userId: string): Promise<void> {
    await this.redisService.delete(RedisKeys.dashboardEmployee(userId));
  }

  async invalidateNotificationsUnread(userId: string): Promise<void> {
    await this.redisService.delete(RedisKeys.notificationsUnread(userId));
  }

  /**
   * Employee created / updated / deleted:
   * employee cache + list + admin and manager dashboards.
   */
  async onEmployeeChanged(
    employeeId: string,
    employeeUserId?: string,
  ): Promise<void> {
    await Promise.all([
      this.invalidateEmployee(employeeId),
      this.invalidateAdminDashboard(),
      this.invalidateAllManagerDashboards(),
      this.invalidateDepartmentsList(),
      employeeUserId
        ? this.invalidateEmployeeDashboard(employeeUserId)
        : Promise.resolve(),
    ]);
  }

  /**
   * Department created / updated / deleted or assignment changed.
   */
  async onDepartmentChanged(departmentId?: string): Promise<void> {
    await Promise.all([
      departmentId
        ? this.invalidateDepartment(departmentId)
        : this.invalidateDepartmentsList(),
      this.invalidateEmployeesList(),
      this.invalidateAdminDashboard(),
      this.invalidateAllManagerDashboards(),
    ]);
  }

  /**
   * Attendance / leave / performance activity for a specific user.
   */
  async onEmployeeActivity(employeeUserId?: string): Promise<void> {
    await Promise.all([
      this.invalidateAdminDashboard(),
      this.invalidateAllManagerDashboards(),
      employeeUserId
        ? this.invalidateEmployeeDashboard(employeeUserId)
        : Promise.resolve(),
    ]);
  }
}
