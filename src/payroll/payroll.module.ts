import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Compensation } from './entities/compensation.entity';
import { SalaryDeduction } from './entities/salary-deduction.entity';
import { SalaryBonus } from './entities/salary-bonus.entity';
import { SalaryHistory } from './entities/salary-history.entity';
import { Employee } from '@/employees/entities/employee.entity';
import { User } from '@/users/entities/user.entity';
import { Attendance } from '@/attendance/entities/attendance.entity';
import { LeaveRequest } from '@/leave/entities/leave.entity';
import { PayrollService } from './payroll.service';
import { PayrollController } from './payroll.controller';
import { ManagerPayrollController } from './manager-payroll.controller';
import { EmployeePayrollController } from './employee-payroll.controller';
import { NotificationsModule } from '@/notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Compensation,
      SalaryDeduction,
      SalaryBonus,
      SalaryHistory,
      Employee,
      User,
      Attendance,
      LeaveRequest,
    ]),
    NotificationsModule,
  ],
  controllers: [
    PayrollController,
    ManagerPayrollController,
    EmployeePayrollController,
  ],
  providers: [PayrollService],
  exports: [PayrollService],
})
export class PayrollModule {}
