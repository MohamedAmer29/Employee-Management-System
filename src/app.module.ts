import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { getDatabaseConfig } from './config/database.config';
import { UsersModule } from './users/users.module';
import { ManagersModule } from './managers/managers.module';
import { EmployeesModule } from './employees/employees.module';
import { LeaveModule } from './leave/leave.module';
import { DepartmentModule } from './department/department.module';
import { PerformanceModule } from './performance/performance.module';
import { AttendanceModule } from './attendance/attendance.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { NotificationsModule } from './notifications/notifications.module';
import { DashboardModule } from './dashboard/dashboard.module';

@Module({
  imports: [
    AuthModule,
    EventEmitterModule.forRoot(),
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],

      useFactory: (configService: ConfigService) =>
        getDatabaseConfig(configService),
    }),
    UsersModule,
    ManagersModule,
    EmployeesModule,
    DepartmentModule,
    AttendanceModule,
    LeaveModule,
    PerformanceModule,
    AuditLogsModule,
    NotificationsModule,
    DashboardModule,
  ],
})
export class AppModule {}
