import { Module } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { AttendanceSchedulerService } from './attendance.scheduler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { Attendance } from './entities/attendance.entity';
import { LeaveRequest } from '@/leave/entities/leave.entity';
import { EmployeesModule } from '../employees/employees.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Attendance, LeaveRequest]),
    UsersModule,
    EmployeesModule,
  ],
  providers: [AttendanceService, AttendanceSchedulerService],
  controllers: [AttendanceController],
  exports: [AttendanceService],
})
export class AttendanceModule {}
