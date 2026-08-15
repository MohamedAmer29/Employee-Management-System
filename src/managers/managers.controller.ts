import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtGuard } from '@/auth/guards/jwt.gaurd';
import { RolesGuard } from '@/auth/guards/role.guard';
import { Roles } from '@/auth/role.decorator';
import { Role } from '@/auth/interfaces/Role.enum';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { ManagersService } from './managers.service';
import { CreateManagerEmployeeDto } from './dto/create-manager-employee.dto';
import { UpdateManagerEmployeeDto } from './dto/update-manager-employee.dto';
import { UpdateEmployeeStatusDto } from './dto/update-employee-status.dto';
import { RejectLeaveDto } from './dto/reject-leave.dto';
import { ManagerEmployeesQueryDto } from './dto/manager-employees-query.dto';
import { CreatePerformanceDto } from '@/performance/dto/create-performance.dto';
import { LeaveStatus } from '@/leave/interfaces/leave.status';

@ApiTags('Manager')
@ApiBearerAuth('Authorization')
@UseGuards(JwtGuard, RolesGuard)
@Controller('manager')
export class ManagersController {
  constructor(private readonly managersService: ManagersService) {}

  // ---------------------------------------------------------------------------
  // Employees
  // ---------------------------------------------------------------------------

  @Get('employees')
  @Roles(Role.manager)
  @ApiOperation({
    summary: 'List employees managed by the authenticated manager',
    description:
      'Returns employees in the manager’s department with pagination, search and status filters. The manager is resolved from the JWT, never from a request parameter.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  getEmployees(
    @CurrentUser('userId') userId: string,
    @Query() query: ManagerEmployeesQueryDto,
  ) {
    return this.managersService.getEmployees(userId, query);
  }

  @Get('employees/:id')
  @Roles(Role.manager)
  @ApiOperation({
    summary: 'Get a single managed employee',
    description:
      'Returns an employee only if they belong to the manager’s department. 404 if not found, 403 if owned by another department.',
  })
  getEmployee(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.managersService.getEmployee(userId, id);
  }

  @Post('employees')
  @Roles(Role.manager)
  @ApiOperation({
    summary: 'Add an existing employee to the manager’s department',
    description:
      'Resolves an existing employee by the provided email and assigns them to the authenticated manager’s department. If no employee exists with that email, an error is returned. Role and department are assigned server-side.',
  })
  createEmployee(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateManagerEmployeeDto,
  ) {
    return this.managersService.createEmployee(userId, dto);
  }

  @Patch('employees/:id')
  @Roles(Role.manager)
  @ApiOperation({
    summary: 'Update a managed employee',
    description:
      'Updates non-sensitive fields of an employee in the manager’s department. Role, linked user, password and department reassignment are not permitted.',
  })
  updateEmployee(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateManagerEmployeeDto,
  ) {
    return this.managersService.updateEmployee(userId, id, dto);
  }

  @Patch('employees/:id/status')
  @Roles(Role.manager)
  @ApiOperation({
    summary: 'Activate or deactivate a managed employee',
    description:
      'Preferred over hard deletion: sets the employee’s active status. Ownership (department) is verified first.',
  })
  setEmployeeStatus(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeStatusDto,
  ) {
    return this.managersService.setEmployeeStatus(userId, id, dto);
  }

  @Delete('employees/:id')
  @Roles(Role.manager)
  @ApiOperation({
    summary: 'Deactivate (soft delete) a managed employee',
    description:
      'Marks the employee inactive rather than permanently deleting the record. Ownership (department) is verified first.',
  })
  deleteEmployee(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.managersService.deleteEmployee(userId, id);
  }

  // ---------------------------------------------------------------------------
  // Attendance
  // ---------------------------------------------------------------------------

  @Get('attendance')
  @Roles(Role.manager)
  @ApiOperation({
    summary: 'List attendance for the manager’s department',
    description:
      'Returns attendance records for employees in the manager’s department. Optionally filtered by employeeId.',
  })
  @ApiQuery({ name: 'employeeId', required: false, type: String })
  getAttendance(
    @CurrentUser('userId') userId: string,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.managersService.getAttendance(userId, employeeId);
  }

  @Get('attendance/:employeeId')
  @Roles(Role.manager)
  @ApiOperation({
    summary: 'Get attendance for a specific managed employee',
    description:
      'Returns attendance records for the given employee, verifying they belong to the manager’s department.',
  })
  getAttendanceForEmployee(
    @CurrentUser('userId') userId: string,
    @Param('employeeId') employeeId: string,
  ) {
    return this.managersService.getAttendanceForEmployee(userId, employeeId);
  }

  // ---------------------------------------------------------------------------
  // Leave
  // ---------------------------------------------------------------------------

  @Get('leaves')
  @Roles(Role.manager)
  @ApiOperation({
    summary: 'List leave requests for the manager’s department',
    description:
      'Returns leave requests for employees in the manager’s department, optionally filtered by status.',
  })
  @ApiQuery({ name: 'status', required: false, type: String })
  getLeaves(
    @CurrentUser('userId') userId: string,
    @Query('status') status?: LeaveStatus,
  ) {
    return this.managersService.getLeaves(userId, status);
  }

  @Get('leaves/:id')
  @Roles(Role.manager)
  @ApiOperation({
    summary: 'Get a leave request',
    description:
      'Returns a leave request only if its employee belongs to the manager’s department.',
  })
  getLeave(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.managersService.getLeave(userId, id);
  }

  @Patch('leaves/:id/approve')
  @Roles(Role.manager)
  @ApiOperation({
    summary: 'Approve a leave request',
    description:
      'Approves a leave request only if its employee belongs to the manager’s department.',
  })
  approveLeave(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.managersService.approveLeave(userId, id);
  }

  @Patch('leaves/:id/reject')
  @Roles(Role.manager)
  @ApiOperation({
    summary: 'Reject a leave request',
    description:
      'Rejects a leave request only if its employee belongs to the manager’s department. An optional reason is recorded in the audit log.',
  })
  rejectLeave(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: RejectLeaveDto,
  ) {
    return this.managersService.rejectLeave(userId, id, dto);
  }

  // ---------------------------------------------------------------------------
  // Performance
  // ---------------------------------------------------------------------------

  @Get('performance')
  @Roles(Role.manager)
  @ApiOperation({
    summary: 'List performance reviews for the manager’s department',
  })
  getPerformance(@CurrentUser('userId') userId: string) {
    return this.managersService.getPerformance(userId);
  }

  @Get('performance/:employeeId')
  @Roles(Role.manager)
  @ApiOperation({
    summary: 'Get performance reviews for a specific managed employee',
    description:
      'Returns performance reviews for the given employee, verifying they belong to the manager’s department.',
  })
  getPerformanceForEmployee(
    @CurrentUser('userId') userId: string,
    @Param('employeeId') employeeId: string,
  ) {
    return this.managersService.getPerformanceForEmployee(userId, employeeId);
  }

  @Post('performance')
  @Roles(Role.manager)
  @ApiOperation({
    summary: 'Create a performance review for a managed employee',
    description:
      'Creates a performance review. The target employee must belong to the manager’s department.',
  })
  createPerformance(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreatePerformanceDto,
  ) {
    return this.managersService.createPerformance(userId, dto);
  }

  // ---------------------------------------------------------------------------
  // Notifications
  // ---------------------------------------------------------------------------

  @Get('notifications')
  @Roles(Role.manager)
  @ApiOperation({
    summary: 'List the manager’s notifications',
    description:
      'Returns paginated notifications belonging to the authenticated manager. Managers can only read their own notifications.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getNotifications(
    @CurrentUser('userId') userId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.managersService.getNotifications(userId, page, limit);
  }

  @Patch('notifications/:id/read')
  @Roles(Role.manager)
  @ApiOperation({
    summary: 'Mark a notification as read',
    description:
      'Marks a notification as read. Managers can only modify their own notifications.',
  })
  markNotificationRead(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.managersService.markNotificationRead(userId, id);
  }
}
