import {
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Employee } from '@/employees/entities/employee.entity';
import { User } from '@/users/entities/user.entity';
import { Attendance } from '@/attendance/entities/attendance.entity';
import { LeaveRequest } from '@/leave/entities/leave.entity';
import { PerformanceReview } from '@/performance/entities/performance';
import { Department } from '@/department/entities/department.entity';
import { Role } from '@/auth/interfaces/Role.enum';
import { AuditAction } from '@/audit-logs/enums/audit-action.enum';
import { LeaveStatus } from '@/leave/interfaces/leave.status';
import { CreatePerformanceDto } from '@/performance/dto/create-performance.dto';
import { EmployeesService } from '@/employees/employees.service';
import { PerformanceService } from '@/performance/performance.service';
import { NotificationsService } from '@/notifications/notifications.service';
import { CacheInvalidationService } from '@/redis/cache-invalidation.service';
import { breakEmployeeUserCycle } from '@/common/utils/break-employee-user-cycle';
import { LeaveApprovedEvent } from '@/common/events/leave-approved.event';
import { LeaveRejectedEvent } from '@/common/events/leave-rejected.event';
import { ERROR_MESSAGES } from '@/common/constants/error-messages';
import { CreateManagerEmployeeDto } from './dto/create-manager-employee.dto';
import { UpdateManagerEmployeeDto } from './dto/update-manager-employee.dto';
import { UpdateEmployeeStatusDto } from './dto/update-employee-status.dto';
import { RejectLeaveDto } from './dto/reject-leave.dto';
import {
  ManagerEmployeesQueryDto,
  ManagerEmployeeStatus,
} from './dto/manager-employees-query.dto';

type SafeUser = Omit<User, 'password'>;

type ManagerEmployeeResponse = Omit<Employee, 'user'> & {
  profilePicture: string | null;
  user?: SafeUser;
};

type ManagerAttendanceResponse = Omit<Attendance, 'employee'> & {
  employee: Omit<Employee, 'user'> & { profilePicture: string | null };
};

type ManagerLeaveResponse = Omit<LeaveRequest, 'employee'> & {
  employee: Omit<Employee, 'user'> & { profilePicture: string | null };
};

type ManagerPerformanceResponse = Omit<PerformanceReview, 'employee'> & {
  employee: Omit<Employee, 'user'> & { profilePicture: string | null };
};

type PaginatedEmployees = {
  data: ManagerEmployeeResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

/**
 * Manager-facing operations.
 *
 * Authorization model: the application has no direct Manager -> Employee
 * relationship. Following the existing DashboardService convention, a Manager
 * is scoped to the department of their own employee profile
 * (user.employee.department). Every Manager resource is therefore filtered to
 * employees that share that department. The authenticated JWT (request.user)
 * is the only source of truth for the Manager identity - no managerId / userId
 * / employeeId from the request body is ever trusted for authorization.
 */
@Injectable()
export class ManagersService {
  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Attendance)
    private readonly attendanceRepository: Repository<Attendance>,
    @InjectRepository(LeaveRequest)
    private readonly leaveRepository: Repository<LeaveRequest>,
    @InjectRepository(PerformanceReview)
    private readonly performanceRepository: Repository<PerformanceReview>,
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
    private readonly employeesService: EmployeesService,
    private readonly performanceService: PerformanceService,
    private readonly notificationsService: NotificationsService,
    private readonly cacheInvalidation: CacheInvalidationService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ---------------------------------------------------------------------------
  // Employees
  // ---------------------------------------------------------------------------

  async getEmployees(
    userId: string,
    query: ManagerEmployeesQueryDto,
  ): Promise<PaginatedEmployees> {
    const departmentId = await this.getManagerDepartmentId(userId);

    if (!departmentId) {
      return {
        data: [],
        pagination: {
          page: query.page ?? 1,
          limit: query.limit ?? 10,
          total: 0,
          totalPages: 0,
        },
      };
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const queryBuilder = this.employeeRepository
      .createQueryBuilder('employee')
      .leftJoinAndSelect('employee.department', 'department')
      .leftJoinAndSelect('employee.user', 'user')
      .where('employee.departmentId = :departmentId', { departmentId });

    if (query.search) {
      queryBuilder.andWhere(
        '(employee.fullName ILIKE :search OR employee.email ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    if (query.status) {
      queryBuilder.andWhere('employee.isActive = :isActive', {
        isActive: query.status === ManagerEmployeeStatus.ACTIVE,
      });
    }

    const [items, total] = await queryBuilder
      .orderBy('employee.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: items.map((employee) => this.toEmployeeResponse(employee)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getEmployee(
    userId: string,
    id: string,
  ): Promise<ManagerEmployeeResponse> {
    const departmentId = await this.requireDepartment(userId);
    const employee = await this.employeeRepository.findOne({
      where: { id },
      relations: ['department', 'user'],
    });
    this.assertManages(employee, departmentId);
    return this.toEmployeeResponse(employee);
  }

  async createEmployee(
    userId: string,
    dto: CreateManagerEmployeeDto,
  ): Promise<ManagerEmployeeResponse> {
    const departmentId = await this.requireDepartment(userId);

    const existingEmployee = await this.employeeRepository.findOne({
      where: { email: dto.email },
    });
    if (existingEmployee) {
      throw new ConflictException(ERROR_MESSAGES.EMPLOYEE_ALREADY_EXISTS);
    }

    let user: User | undefined;
    if (dto.userId) {
      const foundUser = await this.userRepository.findOne({
        where: { id: dto.userId },
        relations: ['employee'],
      });

      if (!foundUser) {
        throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);
      }
      if (foundUser.employee) {
        throw new ConflictException(ERROR_MESSAGES.EMPLOYEE_HAS_USER);
      }
      if (foundUser.role !== Role.employee) {
        throw new ConflictException(ERROR_MESSAGES.EMPLOYEE_ROLE_MISMATCH);
      }
      if (foundUser.username !== dto.email) {
        throw new ConflictException(
          'Employee email must match the user account email',
        );
      }
      user = foundUser;
    }

    const department = await this.departmentRepository.findOne({
      where: { id: departmentId },
    });
    if (!department) {
      throw new NotFoundException(ERROR_MESSAGES.DEPARTMENT_NOT_FOUND);
    }

    const employee = this.employeeRepository.create({
      fullName: dto.fullName,
      email: dto.email,
      phone: dto.phone,
      position: dto.position,
      isActive: true,
      role: Role.employee,
      user,
      department,
    });

    const saved = await this.employeeRepository.save(employee);

    await this.cacheInvalidation.onEmployeeChanged(saved.id, user?.id);

    this.eventEmitter.emit('audit.log.created', {
      userId,
      action: AuditAction.CREATE,
      entity: 'Employee',
      entityId: String(saved.id),
      description: 'Manager created an employee',
      newValues: {
        fullName: saved.fullName,
        email: saved.email,
        position: saved.position,
        departmentId,
        userId: user?.id,
      },
    });

    const created = await this.employeeRepository.findOne({
      where: { id: saved.id },
      relations: ['department', 'user'],
    });
    if (!created) {
      throw new NotFoundException(ERROR_MESSAGES.EMPLOYEE_NOT_FOUND);
    }

    return this.toEmployeeResponse(created);
  }

  async updateEmployee(
    userId: string,
    id: string,
    dto: UpdateManagerEmployeeDto,
  ): Promise<ManagerEmployeeResponse> {
    const departmentId = await this.requireDepartment(userId);
    const employee = await this.employeeRepository.findOne({
      where: { id },
      relations: ['department', 'user'],
    });
    this.assertManages(employee, departmentId);

    const oldValues: Record<string, unknown> = {};

    if (dto.fullName) {
      oldValues.fullName = employee.fullName;
      employee.fullName = dto.fullName;
    }
    if (dto.email && dto.email !== employee.email) {
      const duplicate = await this.employeeRepository.findOne({
        where: { email: dto.email },
      });
      if (duplicate && duplicate.id !== employee.id) {
        throw new ConflictException(ERROR_MESSAGES.EMPLOYEE_ALREADY_EXISTS);
      }
      oldValues.email = employee.email;
      employee.email = dto.email;
    }
    if (dto.phone) {
      oldValues.phone = employee.phone;
      employee.phone = dto.phone;
    }
    if (dto.position) {
      oldValues.position = employee.position;
      employee.position = dto.position;
    }
    if (dto.isActive !== undefined) {
      oldValues.isActive = employee.isActive;
      if (employee.user) {
        employee.user.isActive = dto.isActive;
        await this.userRepository.save(employee.user);
      }
      employee.isActive = dto.isActive;
    }

    const updated = await this.employeeRepository.save(employee);

    await this.cacheInvalidation.onEmployeeChanged(
      updated.id,
      updated.user?.id,
    );

    this.eventEmitter.emit('audit.log.created', {
      userId,
      action: AuditAction.UPDATE,
      entity: 'Employee',
      entityId: String(updated.id),
      description: 'Manager updated an employee',
      oldValues,
      newValues: dto,
    });

    return this.toEmployeeResponse(updated);
  }

  async setEmployeeStatus(
    userId: string,
    id: string,
    dto: UpdateEmployeeStatusDto,
  ): Promise<ManagerEmployeeResponse> {
    const departmentId = await this.requireDepartment(userId);
    const employee = await this.employeeRepository.findOne({
      where: { id },
      relations: ['department', 'user'],
    });
    this.assertManages(employee, departmentId);

    const previous = employee.isActive;
    if (employee.user) {
      employee.user.isActive = dto.isActive;
      await this.userRepository.save(employee.user);
    }
    employee.isActive = dto.isActive;
    const updated = await this.employeeRepository.save(employee);

    await this.cacheInvalidation.onEmployeeChanged(
      updated.id,
      updated.user?.id,
    );

    this.eventEmitter.emit('audit.log.created', {
      userId,
      action: AuditAction.UPDATE,
      entity: 'Employee',
      entityId: String(updated.id),
      description: `Employee status changed to ${dto.isActive ? 'active' : 'inactive'}`,
      oldValues: { isActive: previous },
      newValues: { isActive: dto.isActive },
    });

    return this.toEmployeeResponse(updated);
  }

  async deleteEmployee(
    userId: string,
    id: string,
  ): Promise<{ message: string }> {
    const departmentId = await this.requireDepartment(userId);
    const employee = await this.employeeRepository.findOne({
      where: { id },
      relations: ['department', 'user'],
    });
    this.assertManages(employee, departmentId);

    const previous = employee.isActive;
    if (employee.user) {
      employee.user.isActive = false;
      await this.userRepository.save(employee.user);
    }
    employee.isActive = false;
    const updated = await this.employeeRepository.save(employee);

    await this.cacheInvalidation.onEmployeeChanged(
      updated.id,
      updated.user?.id,
    );

    this.eventEmitter.emit('audit.log.created', {
      userId,
      action: AuditAction.DELETE,
      entity: 'Employee',
      entityId: String(updated.id),
      description: 'Manager deactivated (soft deleted) an employee',
      oldValues: { isActive: previous },
      newValues: { isActive: false },
    });

    return { message: 'Employee deactivated successfully' };
  }

  // ---------------------------------------------------------------------------
  // Attendance
  // ---------------------------------------------------------------------------

  async getAttendance(
    userId: string,
    employeeId?: string,
  ): Promise<ManagerAttendanceResponse[]> {
    const departmentId = await this.requireDepartment(userId);

    const queryBuilder = this.attendanceRepository
      .createQueryBuilder('attendance')
      .leftJoinAndSelect('attendance.employee', 'employee')
      .leftJoinAndSelect('employee.user', 'user')
      .where('employee.departmentId = :departmentId', { departmentId });

    if (employeeId) {
      queryBuilder.andWhere('attendance."employeeId" = :employeeId', {
        employeeId,
      });
    }

    const records = await queryBuilder
      .orderBy('attendance.date', 'DESC')
      .getMany();

    return records.map((record) => this.toAttendanceResponse(record));
  }

  async getAttendanceForEmployee(
    userId: string,
    employeeId: string,
  ): Promise<ManagerAttendanceResponse[]> {
    const departmentId = await this.requireDepartment(userId);
    const employee = await this.employeeRepository.findOne({
      where: { id: employeeId },
      relations: ['department'],
    });
    this.assertManages(employee, departmentId);

    const records = await this.attendanceRepository.find({
      where: { employee: { id: employeeId } },
      relations: ['employee', 'employee.user'],
      order: { date: 'DESC' },
    });

    return records.map((record) => this.toAttendanceResponse(record));
  }

  // ---------------------------------------------------------------------------
  // Leave
  // ---------------------------------------------------------------------------

  async getLeaves(
    userId: string,
    status?: LeaveStatus,
  ): Promise<ManagerLeaveResponse[]> {
    const departmentId = await this.requireDepartment(userId);

    const queryBuilder = this.leaveRepository
      .createQueryBuilder('leave')
      .leftJoinAndSelect('leave.employee', 'employee')
      .leftJoinAndSelect('employee.user', 'user')
      .where('employee.departmentId = :departmentId', { departmentId });

    if (status) {
      queryBuilder.andWhere('leave.status = :status', { status });
    }

    const leaves = await queryBuilder.orderBy('leave.id', 'DESC').getMany();

    return leaves.map((leave) => this.toLeaveResponse(leave));
  }

  async getLeave(userId: string, id: string): Promise<ManagerLeaveResponse> {
    const departmentId = await this.requireDepartment(userId);
    const leave = await this.leaveRepository.findOne({
      where: { id: Number(id) },
      relations: ['employee', 'employee.department', 'employee.user'],
    });
    if (!leave) {
      throw new NotFoundException(ERROR_MESSAGES.LEAVE_NOT_FOUND);
    }
    this.assertManages(leave.employee, departmentId);
    return this.toLeaveResponse(leave);
  }

  async approveLeave(
    userId: string,
    id: string,
  ): Promise<ManagerLeaveResponse> {
    const departmentId = await this.requireDepartment(userId);
    const leave = await this.leaveRepository.findOne({
      where: { id: Number(id) },
      relations: ['employee', 'employee.department', 'employee.user'],
    });
    if (!leave) {
      throw new NotFoundException(ERROR_MESSAGES.LEAVE_NOT_FOUND);
    }
    this.assertManages(leave.employee, departmentId);

    return this.processLeave(userId, leave, LeaveStatus.APPROVED);
  }

  async rejectLeave(
    userId: string,
    id: string,
    dto: RejectLeaveDto,
  ): Promise<ManagerLeaveResponse> {
    const departmentId = await this.requireDepartment(userId);
    const leave = await this.leaveRepository.findOne({
      where: { id: Number(id) },
      relations: ['employee', 'employee.department', 'employee.user'],
    });
    if (!leave) {
      throw new NotFoundException(ERROR_MESSAGES.LEAVE_NOT_FOUND);
    }
    this.assertManages(leave.employee, departmentId);

    return this.processLeave(userId, leave, LeaveStatus.REJECTED, dto.reason);
  }

  // ---------------------------------------------------------------------------
  // Performance
  // ---------------------------------------------------------------------------

  async getPerformance(userId: string): Promise<ManagerPerformanceResponse[]> {
    const departmentId = await this.requireDepartment(userId);

    const reviews = await this.performanceRepository
      .createQueryBuilder('review')
      .leftJoinAndSelect('review.employee', 'employee')
      .leftJoinAndSelect('employee.user', 'user')
      .where('employee.departmentId = :departmentId', { departmentId })
      .orderBy('review.reviewDate', 'DESC')
      .getMany();

    return reviews.map((review) => this.toPerformanceResponse(review));
  }

  async getPerformanceForEmployee(
    userId: string,
    employeeId: string,
  ): Promise<ManagerPerformanceResponse[]> {
    const departmentId = await this.requireDepartment(userId);
    const employee = await this.employeeRepository.findOne({
      where: { id: employeeId },
      relations: ['department'],
    });
    this.assertManages(employee, departmentId);

    const reviews = await this.performanceRepository.find({
      where: { employee: { id: employeeId } },
      relations: ['employee', 'employee.user'],
      order: { reviewDate: 'DESC' },
    });

    return reviews.map((review) => this.toPerformanceResponse(review));
  }

  async createPerformance(
    userId: string,
    dto: CreatePerformanceDto,
  ): Promise<PerformanceReview> {
    const departmentId = await this.requireDepartment(userId);
    const employee = await this.employeeRepository.findOne({
      where: { id: dto.employeeId },
      relations: ['department'],
    });
    if (!employee) {
      throw new NotFoundException(ERROR_MESSAGES.EMPLOYEE_NOT_FOUND);
    }
    this.assertManages(employee, departmentId);

    // PerformanceService performs the author-role check, audit log and event.
    return this.performanceService.create(userId, dto);
  }

  // ---------------------------------------------------------------------------
  // Notifications
  // ---------------------------------------------------------------------------

  getNotifications(userId: string, page = '1', limit = '20') {
    return this.notificationsService.findAllForUser(
      userId,
      Number(page),
      Number(limit),
    );
  }

  markNotificationRead(userId: string, id: string) {
    return this.notificationsService.markAsRead(id, userId);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Returns the department id of the manager's own employee profile, or null
   * when the manager has no employee record / department assignment.
   */
  private async getManagerDepartmentId(userId: string): Promise<string | null> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['employee', 'employee.department'],
    });

    if (!user || !user.employee) {
      return null;
    }

    return user.employee.department?.id ?? null;
  }

  private async requireDepartment(userId: string): Promise<string> {
    const departmentId = await this.getManagerDepartmentId(userId);
    if (!departmentId) {
      throw new ForbiddenException(
        'You are not assigned to a department and cannot manage employees',
      );
    }
    return departmentId;
  }

  private assertManages(
    employee: Employee | null,
    departmentId: string | null,
  ): asserts employee is Employee {
    if (!employee) {
      throw new NotFoundException(ERROR_MESSAGES.EMPLOYEE_NOT_FOUND);
    }
    if (!departmentId || employee.department?.id !== departmentId) {
      throw new ForbiddenException(
        'You are not authorized to access this employee',
      );
    }
  }

  private async processLeave(
    userId: string,
    leave: LeaveRequest,
    status: LeaveStatus,
    reason?: string,
  ): Promise<ManagerLeaveResponse> {
    if (leave.status === status) {
      throw new BadRequestException(`Leave request is already ${status}`);
    }

    const previousStatus = leave.status;
    leave.status = status;
    const updated = await this.leaveRepository.save(leave);

    const employeeUser = await this.userRepository.findOne({
      where: { employee: { id: leave.employee.id } },
    });

    if (employeeUser) {
      if (status === LeaveStatus.APPROVED) {
        this.eventEmitter.emit(
          'leave.approved',
          new LeaveApprovedEvent(employeeUser.id, leave.employee.fullName),
        );
      } else {
        this.eventEmitter.emit(
          'leave.rejected',
          new LeaveRejectedEvent(
            employeeUser.id,
            leave.employee.fullName,
            reason,
          ),
        );
      }
    }

    this.eventEmitter.emit('audit.log.created', {
      userId,
      action:
        status === LeaveStatus.APPROVED
          ? AuditAction.APPROVE
          : AuditAction.REJECT,
      entity: 'LeaveRequest',
      entityId: String(updated.id),
      description: reason
        ? `Leave request ${status} - ${reason}`
        : `Leave request ${status}`,
      oldValues: { status: previousStatus },
      newValues: { status, reason },
    });

    return this.toLeaveResponse(updated);
  }

  private toEmployeeResponse(employee: Employee): ManagerEmployeeResponse {
    const profilePicture = employee.user?.profilePicture ?? null;

    if (!employee.user) {
      return { ...employee, profilePicture } as ManagerEmployeeResponse;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...safeUser } = employee.user;
    breakEmployeeUserCycle(safeUser.employee);
    const employeeRest = { ...employee };
    breakEmployeeUserCycle(employeeRest);

    return {
      ...employeeRest,
      profilePicture,
      user: safeUser,
    } as ManagerEmployeeResponse;
  }

  private toAttendanceResponse(
    attendance: Attendance,
  ): ManagerAttendanceResponse {
    const { user, ...employee } = attendance.employee;
    return {
      ...attendance,
      employee: {
        ...employee,
        profilePicture: user?.profilePicture ?? null,
      },
    } as ManagerAttendanceResponse;
  }

  private toLeaveResponse(leave: LeaveRequest): ManagerLeaveResponse {
    const { user, ...employee } = leave.employee;
    return {
      ...leave,
      employee: {
        ...employee,
        profilePicture: user?.profilePicture ?? null,
      },
    } as ManagerLeaveResponse;
  }

  private toPerformanceResponse(
    review: PerformanceReview,
  ): ManagerPerformanceResponse {
    const { user, ...employee } = review.employee;
    return {
      ...review,
      employee: {
        ...employee,
        profilePicture: user?.profilePicture ?? null,
      },
    } as ManagerPerformanceResponse;
  }
}
