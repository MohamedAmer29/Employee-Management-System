import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PayrollService } from './payroll.service';
import { PayrollQueryDto } from './dto/payroll-query.dto';
import { JwtGuard } from '@/auth/guards/jwt.gaurd';
import { RolesGuard } from '@/auth/guards/role.guard';
import { Roles } from '@/auth/role.decorator';
import { Role } from '@/auth/interfaces/Role.enum';
import { CurrentUser } from '@/common/decorators/current-user.decorator';

@ApiTags('Manager Payroll')
@ApiBearerAuth('Authorization')
@UseGuards(JwtGuard, RolesGuard)
@Controller('manager/payroll')
export class ManagerPayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Get('summary')
  @Roles(Role.manager)
  @ApiOperation({
    summary: 'Payroll summary for the manager department',
    description:
      'Aggregated payroll statistics (totals + status counts) for employees in the manager own department. The department is derived from the authenticated manager.',
  })
  getSummary(
    @CurrentUser('userId') userId: string,
    @Query() query: PayrollQueryDto,
  ) {
    return this.payrollService.getManagerSummary(userId, query);
  }

  @Get()
  @Roles(Role.manager)
  @ApiOperation({
    summary: 'List payroll records in the manager department',
    description:
      'Returns payroll records for employees in the manager own department. Filtering by employeeId/month/year/status is supported; the department restriction is always enforced.',
  })
  findAll(
    @Query() query: PayrollQueryDto,
    @CurrentUser('role') role: Role,
    @CurrentUser('userId') userId: string,
  ) {
    return this.payrollService.findAll(query, role, userId);
  }

  @Get(':employeeId/monthly')
  @Roles(Role.manager)
  @ApiOperation({
    summary: 'List payroll records for a department employee',
  })
  findByEmployeeMonthly(
    @Param('employeeId') employeeId: string,
    @CurrentUser('role') role: Role,
    @CurrentUser('userId') userId: string,
    @Query() query: PayrollQueryDto,
  ) {
    return this.payrollService.findByEmployee(employeeId, role, userId, query);
  }

  @Get(':employeeId')
  @Roles(Role.manager)
  @ApiOperation({
    summary: 'List payroll records for a specific department employee',
    description:
      'Returns payroll records for the given employee, but only when the employee belongs to the managers department.',
  })
  findByEmployee(
    @Param('employeeId') employeeId: string,
    @CurrentUser('role') role: Role,
    @CurrentUser('userId') userId: string,
    @Query() query: PayrollQueryDto,
  ) {
    return this.payrollService.findByEmployee(employeeId, role, userId, query);
  }
}
