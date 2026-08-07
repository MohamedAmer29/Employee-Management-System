import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
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
import { AuditLogsService } from './audit-logs.service';
import { AuditLogFilterDto } from './dto/audit-log-filter.dto';

@ApiTags('Audit Logs')
@ApiBearerAuth('Authorization')
@UseGuards(JwtGuard, RolesGuard)
@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  @Roles(Role.admin)
  @ApiOperation({
    summary: 'Retrieve audit logs (admin only)',
    description:
      'Returns paginated audit logs with optional filtering by action, entity, user, and date range. Only accessible by admins.',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 20)',
  })
  @ApiQuery({
    name: 'action',
    required: false,
    enum: [
      'LOGIN',
      'LOGOUT',
      'LOGIN_FAILED',
      'CREATE',
      'UPDATE',
      'DELETE',
      'APPROVE',
      'REJECT',
      'CHECK_IN',
      'CHECK_OUT',
      'PASSWORD_CHANGE',
      'ROLE_CHANGE',
    ],
    description: 'Filter by action type',
  })
  @ApiQuery({
    name: 'entity',
    required: false,
    type: String,
    description: 'Filter by entity type (e.g., User, Employee, LeaveRequest)',
  })
  @ApiQuery({
    name: 'userId',
    required: false,
    type: String,
    description: 'Filter by user ID',
  })
  @ApiQuery({
    name: 'dateFrom',
    required: false,
    type: String,
    description: 'Filter by date from (ISO format)',
  })
  @ApiQuery({
    name: 'dateTo',
    required: false,
    type: String,
    description: 'Filter by date to (ISO format)',
  })
  @ApiResponse({
    status: 200,
    description: 'Audit logs retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  findAll(@Query() filterDto: AuditLogFilterDto) {
    return this.auditLogsService.findAll(filterDto);
  }

  @Get('user/:userId')
  @Roles(Role.admin)
  @ApiOperation({
    summary: 'Retrieve audit logs for a specific user',
    description:
      'Returns paginated audit logs for a specific user ID. Only accessible by admins.',
  })
  @ApiResponse({
    status: 200,
    description: 'User audit logs retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  findByUser(
    @Param('userId') userId: string,
    @Query() filterDto: AuditLogFilterDto,
  ) {
    return this.auditLogsService.findByUser(userId, filterDto);
  }

  @Get('entity/:entity')
  @Roles(Role.admin)
  @ApiOperation({
    summary: 'Retrieve audit logs for a specific entity',
    description:
      'Returns paginated audit logs for a specific entity type (e.g., Employee, LeaveRequest). Only accessible by admins.',
  })
  @ApiResponse({
    status: 200,
    description: 'Entity audit logs retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  findByEntity(
    @Param('entity') entity: string,
    @Query() filterDto: AuditLogFilterDto,
  ) {
    return this.auditLogsService.findByEntity(entity, filterDto);
  }

  @Get(':id')
  @Roles(Role.admin)
  @ApiOperation({
    summary: 'Retrieve a single audit log entry',
    description:
      'Returns detailed information about a specific audit log entry including user details. Only accessible by admins.',
  })
  @ApiResponse({ status: 200, description: 'Audit log retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  @ApiResponse({ status: 404, description: 'Audit log not found' })
  findOne(@Param('id') id: string) {
    return this.auditLogsService.findOne(id);
  }
}
