import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtGuard } from '@/auth/guards/jwt.gaurd';
import { RolesGuard } from '@/auth/guards/role.guard';
import { Roles } from '@/auth/role.decorator';
import { Role } from '@/auth/interfaces/Role.enum';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { DashboardService } from './dashboard.service';
import { DashboardPeriod } from './enums/dashboard-period.enum';

@ApiTags('Dashboard')
@ApiBearerAuth('Authorization')
@UseGuards(JwtGuard, RolesGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('admin')
  @Roles(Role.admin)
  @ApiOperation({
    summary: 'Get admin dashboard statistics',
    description:
      'Returns organization-wide statistics including employee counts, department distribution, attendance, leave requests, performance reviews, notifications, and recent activities. Only accessible by admins.',
  })
  @ApiResponse({
    status: 200,
    description: 'Admin dashboard retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  getAdminDashboard() {
    return this.dashboardService.getAdminDashboard();
  }

  @Get('admin/attendance')
  @Roles(Role.admin)
  @ApiOperation({
    summary: 'Get admin attendance trends',
    description:
      'Returns attendance trends over a specified period (today, week, month, year). Only accessible by admins.',
  })
  @ApiQuery({
    name: 'period',
    required: true,
    enum: DashboardPeriod,
    description: 'Time period for attendance trend',
  })
  @ApiResponse({
    status: 200,
    description: 'Attendance trends retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  getAdminAttendanceTrend(@Query('period') period: DashboardPeriod) {
    return this.dashboardService.getAdminAttendanceTrend(period);
  }

  @Get('manager')
  @Roles(Role.manager)
  @ApiOperation({
    summary: 'Get manager dashboard statistics',
    description:
      "Returns statistics for the manager's department including employee counts, attendance, leave requests, performance reviews, notifications, and recent activities. Only accessible by managers.",
  })
  @ApiResponse({
    status: 200,
    description: 'Manager dashboard retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Manager access required',
  })
  getManagerDashboard(@CurrentUser('userId') userId: string) {
    return this.dashboardService.getManagerDashboard(userId);
  }

  @Get('employee')
  @Roles(Role.employee)
  @ApiOperation({
    summary: 'Get employee dashboard statistics',
    description:
      'Returns personal statistics for the authenticated employee including personal information, attendance, leave requests, performance reviews, and notifications. Only accessible by employees.',
  })
  @ApiResponse({
    status: 200,
    description: 'Employee dashboard retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Employee access required',
  })
  getEmployeeDashboard(@CurrentUser('userId') userId: string) {
    return this.dashboardService.getEmployeeDashboard(userId);
  }
}
