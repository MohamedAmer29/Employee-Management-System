import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { getDatabaseConfig } from './config/database.config';
import { UsersModule } from './users/users.module';
import { ManagersModule } from './managers/managers.module';
import { EmployeesModule } from './employees/employees.module';
import { LeaveModule } from './leave/leave.module';
import { DepartmentController } from './department/department.controller';
import { DepartmentService } from './department/department.service';
import { PerformanceService } from './performance/performance.service';
import { PerformanceController } from './performance/performance.controller';
import { DepartmentModule } from './department/department.module';
import { PerformanceModule } from './performance/performance.module';
import { AttendanceModule } from './attendance/attendance.module';

@Module({
  imports: [
    AuthModule,
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
    DepartmentModule,
    PerformanceModule,
  ],
  controllers: [DepartmentController, PerformanceController],
  providers: [DepartmentService, PerformanceService],
})
export class AppModule {}
