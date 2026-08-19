import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { AdminAttendanceController } from './admin-attendance.controller';
import { AdminAttendanceService } from './admin-attendance.service';
import { Employee } from '@/employees/entities/employee.entity';
import { Attendance } from '@/attendance/entities/attendance.entity';
import { LeaveRequest } from '@/leave/entities/leave.entity';
import { PerformanceReview } from '@/performance/entities/performance';
import { Notification } from '@/notifications/notification.entity';
import { AuditLog } from '@/audit-logs/audit-log.entity';
import { Department } from '@/department/entities/department.entity';
import { User } from '@/users/entities/user.entity';
import { Compensation } from '@/payroll/entities/compensation.entity';
import { DashboardCacheListener } from './dashboard-cache.listener';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Employee,
      Attendance,
      LeaveRequest,
      PerformanceReview,
      Notification,
      AuditLog,
      Department,
      User,
      Compensation,
    ]),
  ],
  controllers: [DashboardController, AdminAttendanceController],
  providers: [DashboardService, AdminAttendanceService, DashboardCacheListener],
  exports: [DashboardService],
})
export class DashboardModule {}
