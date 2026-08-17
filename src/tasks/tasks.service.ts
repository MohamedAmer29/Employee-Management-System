import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Task } from './entities/task.entity';
import { Employee } from '@/employees/entities/employee.entity';
import { User } from '@/users/entities/user.entity';
import { Department } from '@/department/entities/department.entity';
import { Role } from '@/auth/interfaces/Role.enum';
import { TaskStatus } from './enums/task-status.enum';
import { TaskPriority } from './enums/task-priority.enum';
import { AuditAction } from '@/audit-logs/enums/audit-action.enum';
import { NotificationType } from '@/notifications/enums/notification-type.enum';
import { NotificationsService } from '@/notifications/notifications.service';
import { ERROR_MESSAGES } from '@/common/constants/error-messages';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';
import { TaskQueryDto } from './dto/task-query.dto';

interface Actor {
  employee?: Employee;
  departmentId?: string;
}

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
    private readonly notificationsService: NotificationsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ---------------------------------------------------------------------------
  // Creation
  // ---------------------------------------------------------------------------

  async create(
    currentUserId: string,
    role: Role,
    dto: CreateTaskDto,
  ): Promise<Record<string, unknown>> {
    const employeeId = dto.employeeId;
    const managerId = dto.managerId;
    const hasEmployee = !!employeeId;
    const hasManager = !!managerId;

    if (!hasEmployee && !hasManager) {
      throw new BadRequestException(
        'Either employeeId or managerId must be provided',
      );
    }
    if (hasEmployee && hasManager) {
      throw new BadRequestException(
        'Provide exactly one of employeeId or managerId, not both',
      );
    }

    const actor = await this.getActor(currentUserId, role);
    const assigneeId = hasEmployee ? employeeId! : managerId!;

    const assignee = await this.employeeRepository.findOne({
      where: { id: assigneeId },
      relations: ['user', 'department'],
    });
    if (!assignee) {
      throw new NotFoundException(ERROR_MESSAGES.EMPLOYEE_NOT_FOUND);
    }
    if (!assignee.isActive) {
      throw new BadRequestException(
        'Cannot assign a task to an inactive employee/manager',
      );
    }
    if (hasManager && assignee.role !== Role.manager) {
      throw new BadRequestException(
        'The assigned manager must have the manager role',
      );
    }
    if (hasEmployee && assignee.role !== Role.employee) {
      throw new BadRequestException(
        'The assigned employee must have the employee role',
      );
    }

    if (role === Role.manager) {
      if (!actor.departmentId) {
        throw new ForbiddenException(ERROR_MESSAGES.FORBIDDEN);
      }
      if (assignee.department?.id !== actor.departmentId) {
        throw new ForbiddenException(
          'You can only assign tasks to users within your department',
        );
      }
    }

    const creator = await this.userRepository.findOne({
      where: { id: currentUserId },
    });

    const task = this.taskRepository.create({
      title: dto.title,
      description: dto.description,
      priority: dto.priority ?? TaskPriority.MEDIUM,
      dueDate: dto.dueDate,
      assignedEmployee: hasEmployee ? assignee : undefined,
      assignedManager: hasManager ? assignee : undefined,
      department: assignee.department ?? undefined,
      createdBy: creator ?? undefined,
      status: TaskStatus.TODO,
    });

    const saved = await this.taskRepository.save(task);
    await this.notifyAssignee(assignee, saved);
    this.eventEmitter.emit('audit.log.created', {
      userId: currentUserId,
      action: AuditAction.TASK_CREATED,
      entity: 'Task',
      entityId: saved.id,
      description: `Task "${saved.title}" created`,
      newValues: { title: saved.title, priority: saved.priority },
    });

    return this.toResponse(await this.findOneEntity(saved.id));
  }

  // ---------------------------------------------------------------------------
  // Listing
  // ---------------------------------------------------------------------------

  async findAll(
    query: TaskQueryDto,
    role: Role,
    currentUserId: string,
  ): Promise<{ data: Record<string, unknown>[]; pagination: Record<string, unknown> }> {
    if (role === Role.employee) {
      throw new ForbiddenException(ERROR_MESSAGES.FORBIDDEN);
    }
    const actor = await this.getActor(currentUserId, role);
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const qb = this.taskRepository
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.assignedEmployee', 'assignedEmployee')
      .leftJoinAndSelect('assignedEmployee.user', 'assignedEmployeeUser')
      .leftJoinAndSelect('assignedEmployee.department', 'assignedEmployeeDept')
      .leftJoinAndSelect('task.assignedManager', 'assignedManager')
      .leftJoinAndSelect('assignedManager.user', 'assignedManagerUser')
      .leftJoinAndSelect('assignedManager.department', 'assignedManagerDept')
      .leftJoinAndSelect('task.createdBy', 'createdBy')
      .leftJoinAndSelect('task.department', 'department');

    if (role === Role.manager && actor.departmentId) {
      qb.andWhere('task.departmentId = :departmentId', {
        departmentId: actor.departmentId,
      });
    }
    if (query.status) {
      qb.andWhere('task.status = :status', { status: query.status });
    }
    if (query.priority) {
      qb.andWhere('task.priority = :priority', { priority: query.priority });
    }
    if (query.employeeId) {
      qb.andWhere('assignedEmployee.id = :employeeId', {
        employeeId: query.employeeId,
      });
    }
    if (query.managerId) {
      qb.andWhere('assignedManager.id = :managerId', {
        managerId: query.managerId,
      });
    }
    if (query.departmentId) {
      qb.andWhere('task.departmentId = :departmentId', {
        departmentId: query.departmentId,
      });
    }
    if (query.createdById) {
      qb.andWhere('createdBy.id = :createdById', {
        createdById: query.createdById,
      });
    }
    if (query.dueDate) {
      qb.andWhere('task.dueDate = :dueDate', { dueDate: query.dueDate });
    }
    if (query.search) {
      qb.andWhere('task.title ILIKE :search', {
        search: `%${query.search}%`,
      });
    }

    qb.orderBy('task.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();
    return {
      data: items.map((task) => this.toResponse(task)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findMine(
    role: Role,
    currentUserId: string,
  ): Promise<Record<string, unknown>[]> {
    const actor = await this.getActor(currentUserId, role);
    if (!actor.employee) {
      throw new ForbiddenException(ERROR_MESSAGES.FORBIDDEN);
    }
    const employeeId = actor.employee.id;

    const tasks = await this.taskRepository
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.assignedEmployee', 'assignedEmployee')
      .leftJoinAndSelect('assignedEmployee.user', 'assignedEmployeeUser')
      .leftJoinAndSelect('assignedEmployee.department', 'assignedEmployeeDept')
      .leftJoinAndSelect('task.assignedManager', 'assignedManager')
      .leftJoinAndSelect('assignedManager.user', 'assignedManagerUser')
      .leftJoinAndSelect('assignedManager.department', 'assignedManagerDept')
      .leftJoinAndSelect('task.createdBy', 'createdBy')
      .leftJoinAndSelect('task.department', 'department')
      .where('assignedEmployee.id = :employeeId', { employeeId })
      .orWhere('assignedManager.id = :employeeId', { employeeId })
      .orderBy('task.createdAt', 'DESC')
      .getMany();

    return tasks.map((task) => this.toResponse(task));
  }

  async findOne(
    id: string,
    role: Role,
    currentUserId: string,
  ): Promise<Record<string, unknown>> {
    const task = await this.findOneEntity(id);
    const actor = await this.getActor(currentUserId, role);
    this.authorize(task, actor, role, true);
    return this.toResponse(task);
  }

  // ---------------------------------------------------------------------------
  // Updates
  // ---------------------------------------------------------------------------

  async update(
    id: string,
    dto: UpdateTaskDto,
    role: Role,
    currentUserId: string,
  ): Promise<Record<string, unknown>> {
    const task = await this.findOneEntity(id);
    const actor = await this.getActor(currentUserId, role);
    this.authorize(task, actor, role, false);

    if (dto.title !== undefined) task.title = dto.title;
    if (dto.description !== undefined) task.description = dto.description;
    if (dto.priority !== undefined) task.priority = dto.priority;
    if (dto.dueDate !== undefined) task.dueDate = dto.dueDate;

    const saved = await this.taskRepository.save(task);
    this.eventEmitter.emit('audit.log.created', {
      userId: currentUserId,
      action: AuditAction.TASK_UPDATED,
      entity: 'Task',
      entityId: saved.id,
      description: `Task "${saved.title}" updated`,
    });
    return this.toResponse(await this.findOneEntity(saved.id));
  }

  async updateStatus(
    id: string,
    dto: UpdateTaskStatusDto,
    role: Role,
    currentUserId: string,
  ): Promise<Record<string, unknown>> {
    const task = await this.findOneEntity(id);
    const actor = await this.getActor(currentUserId, role);
    this.authorize(task, actor, role, true);

    task.status = dto.status;
    if (dto.status === TaskStatus.IN_PROGRESS && !task.startedAt) {
      task.startedAt = new Date();
    }
    if (dto.status === TaskStatus.COMPLETED) {
      task.completedAt = new Date();
    }
    if (dto.status === TaskStatus.TODO) {
      task.startedAt = undefined;
      task.completedAt = undefined;
    }

    const saved = await this.taskRepository.save(task);
    let action = AuditAction.TASK_UPDATED;
    if (dto.status === TaskStatus.COMPLETED) action = AuditAction.TASK_COMPLETED;
    if (dto.status === TaskStatus.CANCELLED) action = AuditAction.TASK_CANCELLED;
    this.eventEmitter.emit('audit.log.created', {
      userId: currentUserId,
      action,
      entity: 'Task',
      entityId: saved.id,
      description: `Task "${saved.title}" status changed to ${saved.status}`,
      newValues: { status: saved.status },
    });
    return this.toResponse(await this.findOneEntity(saved.id));
  }

  async remove(
    id: string,
    role: Role,
    currentUserId: string,
  ): Promise<{ success: boolean }> {
    const task = await this.findOneEntity(id);
    const actor = await this.getActor(currentUserId, role);
    this.authorize(task, actor, role, false);

    await this.taskRepository.remove(task);
    this.eventEmitter.emit('audit.log.created', {
      userId: currentUserId,
      action: AuditAction.TASK_DELETED,
      entity: 'Task',
      entityId: id,
      description: `Task "${task.title}" deleted`,
    });
    return { success: true };
  }

  // ---------------------------------------------------------------------------
  // Background: mark overdue tasks
  // ---------------------------------------------------------------------------

  @Cron(CronExpression.EVERY_HOUR)
  async markOverdueTasks(): Promise<void> {
    await this.taskRepository
      .createQueryBuilder()
      .update(Task)
      .set({ status: TaskStatus.OVERDUE })
      .where('dueDate IS NOT NULL')
      .andWhere('dueDate < CURRENT_DATE')
      .andWhere('status NOT IN (:...statuses)', {
        statuses: [
          TaskStatus.COMPLETED,
          TaskStatus.CANCELLED,
          TaskStatus.OVERDUE,
        ],
      })
      .execute();
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async findOneEntity(id: string): Promise<Task> {
    const task = await this.taskRepository.findOne({
      where: { id },
      relations: [
        'assignedEmployee',
        'assignedEmployee.user',
        'assignedEmployee.department',
        'assignedManager',
        'assignedManager.user',
        'assignedManager.department',
        'createdBy',
        'department',
      ],
    });
    if (!task) {
      throw new NotFoundException(ERROR_MESSAGES.NOT_FOUND);
    }
    return task;
  }

  private async getActor(
    userId: string,
    role: Role,
  ): Promise<Actor> {
    if (role === Role.admin) {
      return {};
    }
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['employee', 'employee.department'],
    });
    if (!user || !user.employee) {
      throw new ForbiddenException(ERROR_MESSAGES.FORBIDDEN);
    }
    return {
      employee: user.employee,
      departmentId: user.employee.department?.id ?? undefined,
    };
  }

  private authorize(
    task: Task,
    actor: Actor,
    role: Role,
    allowAssignee: boolean,
  ): void {
    if (role === Role.admin) {
      return;
    }
    const isAssignee =
      !!actor.employee &&
      (!!task.assignedEmployee && task.assignedEmployee.id === actor.employee.id ||
        !!task.assignedManager && task.assignedManager.id === actor.employee.id);

    if (role === Role.manager) {
      if (actor.departmentId && task.department?.id === actor.departmentId) {
        return;
      }
      if (allowAssignee && isAssignee) {
        return;
      }
      throw new ForbiddenException(ERROR_MESSAGES.FORBIDDEN);
    }
    if (role === Role.employee) {
      if (allowAssignee && isAssignee) {
        return;
      }
      throw new ForbiddenException(ERROR_MESSAGES.FORBIDDEN);
    }
    throw new ForbiddenException(ERROR_MESSAGES.FORBIDDEN);
  }

  private async notifyAssignee(
    assignee: Employee,
    task: Task,
  ): Promise<void> {
    const userId = assignee.user?.id;
    if (!userId) {
      return;
    }
    try {
      await this.notificationsService.create({
        userId,
        type: NotificationType.TASK_ASSIGNED,
        title: 'New task assigned',
        message: `You have been assigned a new task: ${task.title}`,
      });
    } catch {
      // Notification is best-effort; do not fail task creation.
    }
  }

  private mapAssignee(employee?: Employee): Record<string, unknown> | null {
    if (!employee) {
      return null;
    }
    return {
      id: employee.id,
      fullName: employee.fullName,
      email: employee.email,
      position: employee.position,
      role: employee.role ?? null,
      isActive: employee.isActive,
      department: employee.department
        ? { id: employee.department.id, name: employee.department.name }
        : null,
      profilePicture: employee.user?.profilePicture ?? null,
      userId: employee.user?.id ?? null,
    };
  }

  private toResponse(task: Task): Record<string, unknown> {
    return {
      id: task.id,
      title: task.title,
      description: task.description ?? null,
      priority: task.priority,
      status: task.status,
      dueDate: task.dueDate ?? null,
      startedAt: task.startedAt ?? null,
      completedAt: task.completedAt ?? null,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      assignedEmployee: this.mapAssignee(task.assignedEmployee),
      assignedManager: this.mapAssignee(task.assignedManager),
      department: task.department
        ? { id: task.department.id, name: task.department.name }
        : null,
      createdBy: task.createdBy
        ? {
            id: task.createdBy.id,
            fullName: `${task.createdBy.firstName} ${task.createdBy.lastName}`.trim(),
          }
        : null,
    };
  }
}
