import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AttendanceService } from './attendance.service';
import { Attendance } from './entities/attendance.entity';
import { JwtGuard } from '../auth/guards/jwt.gaurd';
import { RolesGuard } from '../auth/guards/role.guard';
import { Roles } from '../auth/role.decorator';
import { Role } from '../auth/interfaces/Role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Attendance')
@ApiBearerAuth('Authorization')
@UseGuards(JwtGuard, RolesGuard)
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post('check-in')
  @Roles(Role.employee)
  @ApiOperation({ summary: 'Employee check-in for today' })
  @ApiResponse({
    status: 200,
    description: 'Checked in successfully',
    type: Attendance,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 409, description: 'Already checked in for today' })
  checkIn(@CurrentUser('userId') userId: string) {
    return this.attendanceService.checkIn(userId);
  }

  @Post('check-out')
  @Roles(Role.employee)
  @ApiOperation({ summary: 'Employee check-out for today' })
  @ApiResponse({
    status: 200,
    description: 'Checked out successfully',
    type: Attendance,
  })
  @ApiResponse({
    status: 400,
    description: 'Check-in required before check-out',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 409, description: 'Already checked out for today' })
  checkOut(@CurrentUser('userId') userId: string) {
    return this.attendanceService.checkOut(userId);
  }

  @Get()
  @Roles(Role.admin, Role.manager)
  @ApiOperation({ summary: 'List all attendance records' })
  @ApiResponse({
    status: 200,
    description: 'Array of attendance records',
    type: Attendance,
    isArray: true,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - admin or manager only',
  })
  findAll() {
    return this.attendanceService.findAll();
  }

  @Get('my-attendance')
  @Roles(Role.employee, Role.manager, Role.admin)
  @ApiOperation({ summary: "Get the current employee's attendance history" })
  @ApiResponse({
    status: 200,
    description: "Array of the employee's attendance records",
    type: Attendance,
    isArray: true,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - employee only' })
  getMyAttendance(@CurrentUser('userId') userId: string) {
    return this.attendanceService.getMyAttendance(userId);
  }

  @Get('my-attendance/summary')
  @Roles(Role.employee, Role.manager, Role.admin)
  @ApiOperation({ summary: "Get the current employee's attendance summary" })
  @ApiResponse({
    status: 200,
    description: "The employee's attendance summary",
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - employee only' })
  getMyAttendanceSummary(@CurrentUser('userId') userId: string) {
    return this.attendanceService.getMyAttendanceSummary(userId);
  }

  @Get(':employeeId')
  @Roles(Role.admin, Role.manager)
  @ApiOperation({ summary: 'Get attendance records for a specific employee' })
  @ApiResponse({
    status: 200,
    description: 'Array of attendance records for the employee',
    type: Attendance,
    isArray: true,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - admin or manager only',
  })
  @ApiResponse({ status: 404, description: 'Employee not found' })
  findByEmployee(@Param('employeeId') employeeId: string) {
    return this.attendanceService.findByEmployee(employeeId);
  }
}
