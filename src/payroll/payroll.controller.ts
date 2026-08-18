import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PayrollService } from './payroll.service';
import { CalculatePayrollDto } from './dto/calculate-payroll.dto';
import { CreateDeductionDto } from './dto/create-deduction.dto';
import { CreateBonusDto } from './dto/create-bonus.dto';
import { PayrollQueryDto } from './dto/payroll-query.dto';
import { JwtGuard } from '@/auth/guards/jwt.gaurd';
import { RolesGuard } from '@/auth/guards/role.guard';
import { Roles } from '@/auth/role.decorator';
import { Role } from '@/auth/interfaces/Role.enum';
import { CurrentUser } from '@/common/decorators/current-user.decorator';

@ApiTags('Payroll')
@ApiBearerAuth('Authorization')
@UseGuards(JwtGuard, RolesGuard)
@Controller('admin/payroll')
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Post('employee/:employeeId/calculate')
  @Roles(Role.admin)
  @ApiOperation({ summary: 'Calculate payroll for an employee' })
  calculateForEmployee(
    @Param('employeeId') employeeId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: CalculatePayrollDto,
  ) {
    return this.payrollService.calculateForEmployee(employeeId, userId, dto);
  }

  @Post('manager/:managerId/calculate')
  @Roles(Role.admin)
  @ApiOperation({ summary: 'Calculate payroll for a manager' })
  calculateForManager(
    @Param('managerId') managerId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: CalculatePayrollDto,
  ) {
    return this.payrollService.calculateForManager(managerId, userId, dto);
  }

  @Get()
  @Roles(Role.admin)
  @ApiOperation({ summary: 'List payroll records (admin)' })
  findAll(
    @Query() query: PayrollQueryDto,
    @CurrentUser('role') role: Role,
    @CurrentUser('userId') userId: string,
  ) {
    return this.payrollService.findAll(query, role, userId);
  }

  @Get('monthly')
  @Roles(Role.admin)
  @ApiOperation({ summary: 'List payroll records for a month/year' })
  findMonthly(
    @Query() query: PayrollQueryDto,
    @CurrentUser('role') role: Role,
    @CurrentUser('userId') userId: string,
  ) {
    return this.payrollService.findAll(query, role, userId);
  }

  @Get('employee/:employeeId')
  @Roles(Role.admin)
  @ApiOperation({ summary: 'List payroll records for an employee' })
  findByEmployee(
    @Param('employeeId') employeeId: string,
    @CurrentUser('role') role: Role,
    @CurrentUser('userId') userId: string,
    @Query() query: PayrollQueryDto,
  ) {
    return this.payrollService.findByEmployee(employeeId, role, userId, query);
  }

  @Get('manager/:managerId')
  @Roles(Role.admin)
  @ApiOperation({ summary: 'List payroll records for a manager' })
  findByManager(
    @Param('managerId') managerId: string,
    @CurrentUser('role') role: Role,
    @CurrentUser('userId') userId: string,
    @Query() query: PayrollQueryDto,
  ) {
    return this.payrollService.findByManager(managerId, role, userId, query);
  }

  @Get(':id')
  @Roles(Role.admin)
  @ApiOperation({ summary: 'Get a payroll record by id' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('role') role: Role,
    @CurrentUser('userId') userId: string,
  ) {
    return this.payrollService.findOne(id, role, userId);
  }

  @Post(':id/deductions')
  @Roles(Role.admin, Role.manager)
  @ApiOperation({ summary: 'Add a deduction to a payroll record' })
  addDeduction(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: Role,
    @Body() dto: CreateDeductionDto,
  ) {
    return this.payrollService.addDeduction(id, userId, role, dto);
  }

  @Post(':id/bonuses')
  @Roles(Role.admin, Role.manager)
  @ApiOperation({ summary: 'Add a bonus to a payroll record' })
  addBonus(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: Role,
    @Body() dto: CreateBonusDto,
  ) {
    return this.payrollService.addBonus(id, userId, role, dto);
  }

  @Patch(':id/approve')
  @Roles(Role.admin)
  @ApiOperation({ summary: 'Approve a payroll record' })
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.payrollService.approve(id, userId);
  }

  @Patch(':id/mark-paid')
  @Roles(Role.admin)
  @ApiOperation({ summary: 'Mark a payroll record as paid' })
  markPaid(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.payrollService.markPaid(id, userId);
  }
}
