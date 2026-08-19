import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PayrollService } from './payroll.service';
import { PayrollQueryDto } from './dto/payroll-query.dto';
import { JwtGuard } from '@/auth/guards/jwt.gaurd';
import { RolesGuard } from '@/auth/guards/role.guard';
import { Roles } from '@/auth/role.decorator';
import { Role } from '@/auth/interfaces/Role.enum';
import { CurrentUser } from '@/common/decorators/current-user.decorator';

@ApiTags('Employee Payroll')
@ApiBearerAuth('Authorization')
@UseGuards(JwtGuard, RolesGuard)
@Controller('employee/payroll')
export class EmployeePayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Get()
  @Roles(Role.employee)
  @ApiOperation({
    summary: 'List the authenticated employee own payroll records',
  })
  findAll(
    @Query() query: PayrollQueryDto,
    @CurrentUser('role') role: Role,
    @CurrentUser('userId') userId: string,
  ) {
    return this.payrollService.findAll(query, role, userId);
  }

  @Get('current')
  @Roles(Role.employee)
  @ApiOperation({
    summary: 'Current month payroll for the authenticated employee',
  })
  getCurrent(@CurrentUser('userId') userId: string) {
    return this.payrollService.getEmployeeCurrentPayroll(userId);
  }

  @Get('history')
  @Roles(Role.employee)
  @ApiOperation({
    summary: 'Payroll history for the authenticated employee',
  })
  getHistory(
    @Query() query: PayrollQueryDto,
    @CurrentUser('role') role: Role,
    @CurrentUser('userId') userId: string,
  ) {
    return this.payrollService.findAll(query, role, userId);
  }

  @Get(':id')
  @Roles(Role.employee)
  @ApiOperation({
    summary: 'A specific payroll record for the authenticated employee',
  })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('role') role: Role,
    @CurrentUser('userId') userId: string,
  ) {
    return this.payrollService.findOne(id, role, userId);
  }
}
