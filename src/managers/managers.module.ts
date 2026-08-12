import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ManagersController } from './managers.controller';
import { ManagersService } from './managers.service';
import { Employee } from '@/employees/entities/employee.entity';
import { User } from '@/users/entities/user.entity';
import { Attendance } from '@/attendance/entities/attendance.entity';
import { LeaveRequest } from '@/leave/entities/leave.entity';
import { PerformanceReview } from '@/performance/entities/performance';
import { Department } from '@/department/entities/department.entity';
import { EmployeesModule } from '@/employees/employees.module';
import { PerformanceModule } from '@/performance/performance.module';
import { NotificationsModule } from '@/notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Employee,
      User,
      Attendance,
      LeaveRequest,
      PerformanceReview,
      Department,
    ]),
    EmployeesModule,
    PerformanceModule,
    NotificationsModule,
  ],
  controllers: [ManagersController],
  providers: [ManagersService],
})
export class ManagersModule {}
