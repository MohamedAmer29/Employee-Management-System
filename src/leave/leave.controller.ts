import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  UseGuards,
  Body,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { LeaveService } from './leave.service';
import { CreateLeaveDto } from './dto/create-leave.dto';
import { JwtGuard } from '../auth/guards/jwt.gaurd';
import { RolesGuard } from '../auth/guards/role.guard';
import { Roles } from '../auth/role.decorator';
import { Role } from '../auth/interfaces/Role.enum';
import { LeaveStatus } from './interfaces/leave.status';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Leave')
@ApiBearerAuth('Authorization')
@UseGuards(JwtGuard, RolesGuard)
@Controller('leave')
export class LeaveController {
  constructor(private readonly leaveService: LeaveService) {}

  @Post()
  @Roles(Role.employee)
  @ApiOperation({ summary: 'Request leave' })
  requestLeave(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateLeaveDto,
  ) {
    return this.leaveService.requestLeave(userId, dto);
  }

  @Patch(':id/approve')
  @Roles(Role.manager, Role.admin)
  @ApiOperation({ summary: 'Approve leave request' })
  approveLeave(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.leaveService.updateLeaveStatus(
      id,
      LeaveStatus.APPROVED,
      userId,
    );
  }

  @Patch(':id/reject')
  @Roles(Role.manager, Role.admin)
  @ApiOperation({ summary: 'Reject leave request' })
  rejectLeave(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.leaveService.updateLeaveStatus(
      id,
      LeaveStatus.REJECTED,
      userId,
    );
  }

  @Get()
  @Roles(Role.admin, Role.manager, Role.employee)
  @ApiOperation({ summary: 'Get leave requests' })
  findAll(
    @CurrentUser('role') role: Role,
    @CurrentUser('userId') userId: string,
  ) {
    return this.leaveService.findAll(role, userId);
  }

  @Get(':employeeId')
  @Roles(Role.admin, Role.manager)
  @ApiOperation({ summary: 'Get leave requests for an employee' })
  findByEmployee(@Param('employeeId') employeeId: string) {
    return this.leaveService.findByEmployee(employeeId);
  }
}
