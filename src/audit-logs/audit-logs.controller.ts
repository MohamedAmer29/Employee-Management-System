import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
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
  @ApiOperation({ summary: 'Retrieve audit logs (admin only)' })
  findAll(@Query() filterDto: AuditLogFilterDto) {
    return this.auditLogsService.findAll(filterDto);
  }

  @Get('user/:userId')
  @Roles(Role.admin)
  @ApiOperation({ summary: 'Retrieve audit logs for a specific user' })
  findByUser(
    @Param('userId') userId: string,
    @Query() filterDto: AuditLogFilterDto,
  ) {
    return this.auditLogsService.findByUser(userId, filterDto);
  }

  @Get('entity/:entity')
  @Roles(Role.admin)
  @ApiOperation({ summary: 'Retrieve audit logs for a specific entity' })
  findByEntity(
    @Param('entity') entity: string,
    @Query() filterDto: AuditLogFilterDto,
  ) {
    return this.auditLogsService.findByEntity(entity, filterDto);
  }

  @Get(':id')
  @Roles(Role.admin)
  @ApiOperation({ summary: 'Retrieve a single audit log entry' })
  findOne(@Param('id') id: string) {
    return this.auditLogsService.findOne(id);
  }
}
