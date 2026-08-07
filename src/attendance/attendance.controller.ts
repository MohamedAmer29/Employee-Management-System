import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AttendanceService } from './attendance.service';
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
  checkIn(@CurrentUser('userId') userId: string) {
    return this.attendanceService.checkIn(userId);
  }

  @Post('check-out')
  @Roles(Role.employee)
  @ApiOperation({ summary: 'Employee check-out for today' })
  checkOut(@CurrentUser('userId') userId: string) {
    return this.attendanceService.checkOut(userId);
  }

  @Get()
  @Roles(Role.admin, Role.manager)
  @ApiOperation({ summary: 'List all attendance records' })
  findAll() {
    return this.attendanceService.findAll();
  }

  @Get(':employeeId')
  @Roles(Role.admin, Role.manager)
  @ApiOperation({ summary: 'Get attendance records for a specific employee' })
  findByEmployee(@Param('employeeId') employeeId: string) {
    return this.attendanceService.findByEmployee(employeeId);
  }
}
