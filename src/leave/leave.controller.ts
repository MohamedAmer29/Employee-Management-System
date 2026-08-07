import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Req,
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
import type { Request } from 'express';

type RequestWithUser = Request & { user: { userId: string; role: Role } };

@ApiTags('Leave')
@ApiBearerAuth('Authorization')
@UseGuards(JwtGuard, RolesGuard)
@Controller('leave')
export class LeaveController {
  constructor(private readonly leaveService: LeaveService) {}

  @Post()
  @Roles(Role.employee)
  @ApiOperation({ summary: 'Request leave' })
  requestLeave(@Req() req: RequestWithUser, @Body() dto: CreateLeaveDto) {
    return this.leaveService.requestLeave(req.user.userId, dto);
  }

  @Patch(':id/approve')
  @Roles(Role.manager, Role.admin)
  @ApiOperation({ summary: 'Approve leave request' })
  approveLeave(@Param('id') id: string) {
    return this.leaveService.updateLeaveStatus(id, LeaveStatus.APPROVED);
  }

  @Patch(':id/reject')
  @Roles(Role.manager, Role.admin)
  @ApiOperation({ summary: 'Reject leave request' })
  rejectLeave(@Param('id') id: string) {
    return this.leaveService.updateLeaveStatus(id, LeaveStatus.REJECTED);
  }

  @Get()
  @Roles(Role.admin, Role.manager, Role.employee)
  @ApiOperation({ summary: 'Get leave requests' })
  findAll(@Req() req: RequestWithUser) {
    return this.leaveService.findAll(req.user.role, req.user.userId);
  }

  @Get(':employeeId')
  @Roles(Role.admin, Role.manager)
  @ApiOperation({ summary: 'Get leave requests for an employee' })
  findByEmployee(@Param('employeeId') employeeId: string) {
    return this.leaveService.findByEmployee(employeeId);
  }
}
