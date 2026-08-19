import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from '@/auth/guards/jwt.gaurd';
import { RolesGuard } from '@/auth/guards/role.guard';
import { Roles } from '@/auth/role.decorator';
import { Role } from '@/auth/interfaces/Role.enum';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { User } from '@/users/entities/user.entity';
import { AdminAttendanceService } from './admin-attendance.service';
import {
  AdminAttendanceQueryDto,
  MonthlyAttendanceQueryDto,
} from './dto/admin-attendance-query.dto';

@ApiTags('Admin Attendance')
@ApiBearerAuth('Authorization')
@UseGuards(JwtGuard, RolesGuard)
@Roles(Role.admin)
@Controller('admin/attendance')
export class AdminAttendanceController {
  constructor(
    private readonly adminAttendanceService: AdminAttendanceService,
  ) {}

  @Get('today')
  getTodayAttendance() {
    return this.adminAttendanceService.getTodayAttendance();
  }

  @Get('summary')
  getSummary(@Query('date') date?: string) {
    return this.adminAttendanceService.getSummary(date);
  }

  @Get('monthly')
  getMonthly(
    @Query() query: MonthlyAttendanceQueryDto,
    @CurrentUser() user?: User,
  ) {
    return this.adminAttendanceService.getMonthlyReport(query, user?.id);
  }

  @Get('absent')
  getAbsent(@Query() query: AdminAttendanceQueryDto) {
    const rest = { ...query };
    delete rest.status;
    return this.adminAttendanceService.getAbsent(rest);
  }

  @Get('employee/:employeeId')
  getEmployeeHistory(
    @Param('employeeId') employeeId: string,
    @Query() query: AdminAttendanceQueryDto,
  ) {
    const rest = { ...query };
    delete rest.status;
    return this.adminAttendanceService.getEmployeeHistory(employeeId, {
      ...rest,
      employeeId,
    });
  }

  @Get('employee/:employeeId/summary')
  getEmployeeSummary(@Param('employeeId') employeeId: string) {
    return this.adminAttendanceService.getEmployeeSummary(employeeId);
  }

  @Get()
  getList(@Query() query: AdminAttendanceQueryDto) {
    return this.adminAttendanceService.getList(query);
  }
}
