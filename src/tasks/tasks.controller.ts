import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';
import { TaskQueryDto } from './dto/task-query.dto';
import { JwtGuard } from '@/auth/guards/jwt.gaurd';
import { RolesGuard } from '@/auth/guards/role.guard';
import { Roles } from '@/auth/role.decorator';
import { Role } from '@/auth/interfaces/Role.enum';
import { CurrentUser } from '@/common/decorators/current-user.decorator';

@ApiTags('Tasks')
@ApiBearerAuth('Authorization')
@UseGuards(JwtGuard, RolesGuard)
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @Roles(Role.admin, Role.manager)
  @ApiOperation({ summary: 'Create a task (admin/manager)' })
  create(
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: Role,
    @Body() dto: CreateTaskDto,
  ) {
    return this.tasksService.create(userId, role, dto);
  }

  @Get()
  @Roles(Role.admin, Role.manager)
  @ApiOperation({ summary: 'List tasks with filters (admin/manager)' })
  findAll(
    @Query() query: TaskQueryDto,
    @CurrentUser('role') role: Role,
    @CurrentUser('userId') userId: string,
  ) {
    return this.tasksService.findAll(query, role, userId);
  }

  @Get('my')
  @Roles(Role.manager, Role.employee)
  @ApiOperation({ summary: 'List tasks assigned to the current user' })
  findMine(
    @CurrentUser('role') role: Role,
    @CurrentUser('userId') userId: string,
  ) {
    return this.tasksService.findMine(role, userId);
  }

  @Get(':id')
  @Roles(Role.admin, Role.manager, Role.employee)
  @ApiOperation({ summary: 'Get a task by id' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('role') role: Role,
    @CurrentUser('userId') userId: string,
  ) {
    return this.tasksService.findOne(id, role, userId);
  }

  @Patch(':id')
  @Roles(Role.admin, Role.manager)
  @ApiOperation({ summary: 'Update a task (admin/manager)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskDto,
    @CurrentUser('role') role: Role,
    @CurrentUser('userId') userId: string,
  ) {
    return this.tasksService.update(id, dto, role, userId);
  }

  @Patch(':id/status')
  @Roles(Role.manager, Role.employee)
  @ApiOperation({ summary: 'Update a task status (manager/employee)' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskStatusDto,
    @CurrentUser('role') role: Role,
    @CurrentUser('userId') userId: string,
  ) {
    return this.tasksService.updateStatus(id, dto, role, userId);
  }

  @Delete(':id')
  @Roles(Role.admin, Role.manager)
  @ApiOperation({ summary: 'Delete a task (admin/manager)' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('role') role: Role,
    @CurrentUser('userId') userId: string,
  ) {
    return this.tasksService.remove(id, role, userId);
  }
}
