import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager, SelectQueryBuilder } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as bcrypt from 'bcrypt';
import { User } from '@/users/entities/user.entity';
import { Employee } from '@/employees/entities/employee.entity';
import { Department } from '@/department/entities/department.entity';
import { Role } from '@/auth/interfaces/Role.enum';
import { AuditAction } from '@/audit-logs/enums/audit-action.enum';
import { SessionService } from '@/auth/session.service';
import { CacheInvalidationService } from '@/redis/cache-invalidation.service';
import { breakEmployeeUserCycle } from '@/common/utils/break-employee-user-cycle';
import { RedisService } from '@/redis/redis.service';
import { RedisKeys, CACHE_TTL } from '@/redis/redis.constants';
import { NotificationsService } from '@/notifications/notifications.service';
import { NotificationType } from '@/notifications/enums/notification-type.enum';
import { ERROR_MESSAGES } from '@/common/constants/error-messages';
import { AssignDepartmentDto } from '@/employees/dto/assign-department.dto';
import { AddManagerDto } from './dto/add-manager.dto';
import { AddAdminDto } from './dto/add-admin.dto';
import { UpdateManagerDto } from './dto/update-manager.dto';
import { UpdateAdminDto } from './dto/update-admin.dto';
import { AdminQueryDto, AdminListStatus } from './dto/admin-query.dto';

type SafeUser = Omit<User, 'password'>;

export interface PaginatedUsers {
  data: SafeUser[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface CreateAccountInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  country: string;
  city: string;
  phoneNumber: string;
  nationalId: string;
  role: Role;
  departmentId?: string;
  position?: string;
}

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
    private readonly sessionService: SessionService,
    private readonly cacheInvalidation: CacheInvalidationService,
    private readonly redisService: RedisService,
    private readonly notificationsService: NotificationsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ---------------------------------------------------------------------------
  // Notifications (best-effort, never break the admin operation)
  // ---------------------------------------------------------------------------

  private async notify(
    userId: string,
    title: string,
    message: string,
  ): Promise<void> {
    try {
      await this.notificationsService.create({
        userId,
        type: NotificationType.SYSTEM,
        title,
        message,
      });
    } catch {
      // notifications are supplementary; ignore failures
    }
  }

  // ---------------------------------------------------------------------------
  // Managers
  // ---------------------------------------------------------------------------

  async addManager(dto: AddManagerDto): Promise<SafeUser> {
    if (!dto.departmentId) {
      throw new BadRequestException(
        'A manager must be assigned to a department',
      );
    }

    const { user } = await this.createAccount({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      password: dto.password,
      country: dto.country,
      city: dto.city,
      phoneNumber: dto.phoneNumber,
      nationalId: dto.nationalId,
      role: Role.manager,
      departmentId: dto.departmentId,
      position: dto.position,
    });

    await this.notify(
      String(user.id),
      'Manager account created',
      `Your manager account (${user.username}) has been created by an administrator.`,
    );

    return this.sanitizeWithRelations(user.id);
  }

  async getAllManagers(query: AdminQueryDto): Promise<PaginatedUsers> {
    const hash = this.queryHash(query);
    return this.redisService.remember<PaginatedUsers>(
      RedisKeys.adminManagers(hash),
      CACHE_TTL.ADMIN_USERS,
      async () => {
        const qb = this.userRepository
          .createQueryBuilder('user')
          .leftJoinAndSelect('user.employee', 'employee')
          .leftJoinAndSelect('employee.department', 'department')
          .where('user.role = :role', { role: Role.manager });

        return this.paginate(qb, query);
      },
    );
  }

  async getManagerDetails(id: string): Promise<SafeUser> {
    return this.redisService.remember<SafeUser>(
      RedisKeys.adminManager(id),
      CACHE_TTL.ADMIN_USERS,
      () => this.sanitizeWithRelations(id, Role.manager),
    );
  }

  async updateManagerData(
    id: string,
    dto: UpdateManagerDto,
  ): Promise<SafeUser> {
    const user = await this.userRepository.findOne({
      where: { id, role: Role.manager },
      relations: ['employee', 'employee.department'],
    });
    if (!user) {
      throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);
    }

    const oldValues: Record<string, unknown> = {};

    if (dto.firstName) {
      oldValues.firstName = user.firstName;
      user.firstName = dto.firstName;
    }
    if (dto.lastName) {
      oldValues.lastName = user.lastName;
      user.lastName = dto.lastName;
    }
    if (dto.country) {
      oldValues.country = user.country;
      user.country = dto.country;
    }
    if (dto.city) {
      oldValues.city = user.city;
      user.city = dto.city;
    }
    if (dto.phoneNumber) {
      oldValues.phoneNumber = user.phoneNumber;
      user.phoneNumber = dto.phoneNumber;
    }
    if (dto.nationalId) {
      oldValues.nationalId = user.nationalId;
      user.nationalId = dto.nationalId;
    }

    let department: Department | undefined;
    if (dto.departmentId) {
      const found = await this.departmentRepository.findOne({
        where: { id: dto.departmentId },
      });
      if (!found) {
        throw new NotFoundException(ERROR_MESSAGES.DEPARTMENT_NOT_FOUND);
      }
      department = found;
    }

    // Update both User and Employee atomically.
    await this.userRepository.manager.transaction(
      async (manager: EntityManager) => {
        await manager.save(User, user);
        if (user.employee) {
          if (dto.firstName || dto.lastName) {
            user.employee.fullName = `${user.firstName} ${user.lastName}`;
          }
          if (dto.phoneNumber) {
            user.employee.phone = user.phoneNumber;
          }
          if (dto.position) {
            user.employee.position = dto.position;
          }
          if (department) {
            user.employee.department = department;
          }
          await manager.save(Employee, user.employee);
        }
      },
    );

    if (department) {
      await this.cacheInvalidation.onDepartmentChanged(department.id);
    }
    await this.cacheInvalidation.invalidateAdminDashboard();
    await this.cacheInvalidation.invalidateAdminUsers();

    if (user.employee) {
      await this.cacheInvalidation.onEmployeeChanged(user.employee.id, user.id);
    }

    this.eventEmitter.emit('audit.log.created', {
      userId: id,
      action: AuditAction.UPDATE_MANAGER,
      entity: 'User',
      entityId: String(id),
      description: 'Administrator updated a manager account',
      oldValues,
      newValues: dto,
    });

    return this.sanitizeWithRelations(id);
  }

  async assignManagerToDepartment(
    id: string,
    dto: AssignDepartmentDto,
  ): Promise<SafeUser> {
    const user = await this.userRepository.findOne({
      where: { id, role: Role.manager },
      relations: ['employee', 'employee.department'],
    });
    if (!user) {
      throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);
    }
    if (!user.employee) {
      throw new NotFoundException(ERROR_MESSAGES.EMPLOYEE_NOT_FOUND);
    }

    const department = await this.departmentRepository.findOne({
      where: { id: dto.departmentId },
    });
    if (!department) {
      throw new NotFoundException(ERROR_MESSAGES.DEPARTMENT_NOT_FOUND);
    }

    user.employee.department = department;
    await this.employeeRepository.save(user.employee);

    await this.cacheInvalidation.onEmployeeChanged(user.employee.id, user.id);
    await this.cacheInvalidation.onDepartmentChanged(department.id);
    await this.cacheInvalidation.invalidateAdminDashboard();
    await this.cacheInvalidation.invalidateAdminUsers();

    this.eventEmitter.emit('audit.log.created', {
      userId: id,
      action: AuditAction.ASSIGN_MANAGER_DEPARTMENT,
      entity: 'Employee',
      entityId: String(user.employee.id),
      description: 'Administrator assigned manager to a department',
      newValues: { departmentId: department.id },
    });

    await this.notify(
      String(user.id),
      'Department assignment',
      `You have been assigned to the ${department.name ?? 'department'}.`,
    );

    return this.sanitizeWithRelations(id);
  }

  async activateManager(id: string): Promise<SafeUser> {
    return this.setActive(id, Role.manager, true);
  }

  async deactivateManager(id: string): Promise<SafeUser> {
    return this.setActive(id, Role.manager, false);
  }

  async removeManager(
    id: string,
    adminId: string,
  ): Promise<{ message: string }> {
    if (adminId === id) {
      throw new ForbiddenException('You cannot remove your own account');
    }

    const user = await this.userRepository.findOne({
      where: { id, role: Role.manager },
      relations: ['employee'],
    });
    if (!user) {
      throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);
    }

    // Prefer the existing deactivation architecture over a hard delete so that
    // historical attendance / leave / performance / audit / notification records
    // linked to this manager are preserved. We deactivate the account, revoke
    // its sessions and invalidate any issued tokens.
    const employeeId = user.employee?.id;

    await this.sessionService.revokeAllSessions(id);
    user.isActive = false;
    user.tokenVersion += 1;
    if (user.employee) {
      user.employee.isActive = false;
      await this.employeeRepository.save(user.employee);
    }
    await this.userRepository.save(user);

    if (employeeId) {
      await this.cacheInvalidation.onEmployeeChanged(employeeId, id);
    }
    await this.cacheInvalidation.invalidateAdminDashboard();
    await this.cacheInvalidation.invalidateAdminUsers();

    this.eventEmitter.emit('audit.log.created', {
      userId: id,
      action: AuditAction.DELETE_MANAGER,
      entity: 'User',
      entityId: String(id),
      description: 'Administrator removed (deactivated) a manager account',
    });

    return { message: 'Manager removed successfully' };
  }

  // ---------------------------------------------------------------------------
  // Admins
  // ---------------------------------------------------------------------------

  async addAdmin(dto: AddAdminDto): Promise<SafeUser> {
    const { user } = await this.createAccount({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      password: dto.password,
      country: dto.country,
      city: dto.city,
      phoneNumber: dto.phoneNumber,
      nationalId: dto.nationalId,
      role: Role.admin,
      departmentId: dto.departmentId,
    });

    await this.notify(
      String(user.id),
      'Administrator account created',
      `Your administrator account (${user.username}) has been created.`,
    );

    return this.sanitizeWithRelations(user.id);
  }

  async getAllAdmins(query: AdminQueryDto): Promise<PaginatedUsers> {
    const hash = this.queryHash(query);
    return this.redisService.remember<PaginatedUsers>(
      RedisKeys.adminAdmins(hash),
      CACHE_TTL.ADMIN_USERS,
      async () => {
        const qb = this.userRepository
          .createQueryBuilder('user')
          .leftJoinAndSelect('user.employee', 'employee')
          .leftJoinAndSelect('employee.department', 'department')
          .where('user.role = :role', { role: Role.admin });

        return this.paginate(qb, query);
      },
    );
  }

  async getAdminDetails(id: string): Promise<SafeUser> {
    return this.redisService.remember<SafeUser>(
      RedisKeys.adminAdmin(id),
      CACHE_TTL.ADMIN_USERS,
      () => this.sanitizeWithRelations(id, Role.admin),
    );
  }

  async updateAdminData(id: string, dto: UpdateAdminDto): Promise<SafeUser> {
    const user = await this.userRepository.findOne({
      where: { id, role: Role.admin },
      relations: ['employee', 'employee.department'],
    });
    if (!user) {
      throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);
    }

    const oldValues: Record<string, unknown> = {};

    if (dto.firstName) {
      oldValues.firstName = user.firstName;
      user.firstName = dto.firstName;
    }
    if (dto.lastName) {
      oldValues.lastName = user.lastName;
      user.lastName = dto.lastName;
    }
    if (dto.country) {
      oldValues.country = user.country;
      user.country = dto.country;
    }
    if (dto.city) {
      oldValues.city = user.city;
      user.city = dto.city;
    }
    if (dto.phoneNumber) {
      oldValues.phoneNumber = user.phoneNumber;
      user.phoneNumber = dto.phoneNumber;
    }
    if (dto.nationalId) {
      oldValues.nationalId = user.nationalId;
      user.nationalId = dto.nationalId;
    }

    // Update both User and Employee atomically.
    await this.userRepository.manager.transaction(
      async (manager: EntityManager) => {
        await manager.save(User, user);
        if (user.employee) {
          if (dto.firstName || dto.lastName) {
            user.employee.fullName = `${user.firstName} ${user.lastName}`;
          }
          if (dto.phoneNumber) {
            user.employee.phone = user.phoneNumber;
          }
          if (dto.position) {
            user.employee.position = dto.position;
          }
          await manager.save(Employee, user.employee);
        }
      },
    );

    await this.cacheInvalidation.invalidateAdminDashboard();
    await this.cacheInvalidation.invalidateAdminUsers();

    if (user.employee) {
      await this.cacheInvalidation.onEmployeeChanged(user.employee.id, user.id);
    }

    this.eventEmitter.emit('audit.log.created', {
      userId: id,
      action: AuditAction.UPDATE,
      entity: 'User',
      entityId: String(id),
      description: 'Administrator updated an admin account',
      oldValues,
      newValues: dto,
    });

    return this.sanitizeWithRelations(id);
  }

  async activateAdmin(id: string): Promise<SafeUser> {
    return this.setActive(id, Role.admin, true);
  }

  async deactivateAdmin(id: string): Promise<SafeUser> {
    const target = await this.userRepository.findOne({
      where: { id, role: Role.admin },
    });
    if (!target) {
      throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);
    }

    // Role-safety: never leave the system without an active administrator.
    if (target.isActive) {
      const activeAdmins = await this.userRepository.count({
        where: { role: Role.admin, isActive: true },
      });
      if (activeAdmins <= 1) {
        throw new BadRequestException(
          'Cannot deactivate the last active administrator',
        );
      }
    }

    return this.setActive(id, Role.admin, false);
  }

  async makeUserAdmin(userId: string): Promise<SafeUser> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['employee'],
    });
    if (!user) {
      throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);
    }
    if (user.role === Role.admin) {
      throw new ConflictException('User is already an administrator');
    }

    const previousRole = user.role;
    user.role = Role.admin;
    if (user.employee) {
      user.employee.role = Role.admin;
      await this.employeeRepository.save(user.employee);
    }

    // Invalidate any active sessions so the elevated role takes effect on the
    // next login and stale tokens are rejected.
    await this.sessionService.revokeAllSessions(userId);
    user.tokenVersion += 1;
    const updated = await this.userRepository.save(user);

    await this.cacheInvalidation.invalidateAdminDashboard();
    await this.cacheInvalidation.invalidateAdminUsers();

    this.eventEmitter.emit('audit.log.created', {
      userId: user.id,
      action: AuditAction.MAKE_USER_ADMIN,
      entity: 'User',
      entityId: String(user.id),
      description: 'Administrator promoted a user to admin',
      oldValues: { role: previousRole },
      newValues: { role: Role.admin },
    });

    await this.notify(
      String(user.id),
      'Promoted to administrator',
      'Your account has been promoted to administrator by an administrator.',
    );

    return this.sanitizeWithRelations(updated.id);
  }

  // ---------------------------------------------------------------------------
  // Sessions
  // ---------------------------------------------------------------------------

  async logoutUser(userId: string): Promise<{
    message: string;
    revokedSessions: number;
  }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);
    }

    const revokedSessions = await this.sessionService.revokeAllSessions(userId);
    user.tokenVersion += 1;
    await this.userRepository.save(user);

    this.eventEmitter.emit('audit.log.created', {
      userId,
      action: AuditAction.FORCE_LOGOUT_USER,
      entity: 'User',
      entityId: String(userId),
      description: 'Administrator logged the user out from all devices',
    });

    await this.notify(
      String(userId),
      'Logged out remotely',
      'An administrator has logged you out of all devices.',
    );

    return {
      message: 'User logged out from all devices successfully',
      revokedSessions,
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Builds a stable cache key component from a list query so that identical
   * filters hit the same Redis entry.
   */
  private queryHash(query: AdminQueryDto): string {
    return JSON.stringify({
      page: query.page ?? 1,
      limit: query.limit ?? 10,
      search: query.search ?? '',
      status: query.status ?? '',
      departmentId: query.departmentId ?? '',
    });
  }

  /**
   * Creates a User and its 1:1 Employee in a single transaction so a failure
   * on either side rolls back. Admin-created accounts are email-verified
   * immediately (no OTP flow) and start active. The employee is linked through
   * employee.user and assigned to the given department when provided.
   */
  private async createAccount(
    data: CreateAccountInput,
  ): Promise<{ user: User; employee: Employee }> {
    const existing = await this.userRepository.findOneBy({
      username: data.email,
    });
    if (existing) {
      throw new ConflictException(ERROR_MESSAGES.USER_ALREADY_EXISTS);
    }

    let department: Department | undefined;
    if (data.departmentId) {
      const found = await this.departmentRepository.findOne({
        where: { id: data.departmentId },
      });
      if (!found) {
        throw new NotFoundException(ERROR_MESSAGES.DEPARTMENT_NOT_FOUND);
      }
      department = found;
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    const { savedUser, savedEmployee } =
      await this.userRepository.manager.transaction(
        async (manager: EntityManager) => {
          const user = manager.create(User, {
            firstName: data.firstName,
            lastName: data.lastName,
            country: data.country,
            city: data.city,
            phoneNumber: data.phoneNumber,
            nationalId: data.nationalId,
            username: data.email,
            password: hashedPassword,
            role: data.role,
            isEmailVerified: true,
            emailVerifiedAt: new Date(),
            isActive: true,
          });
          const savedUser = await manager.save(User, user);

          const employee = manager.create(Employee, {
            fullName: `${data.firstName} ${data.lastName}`,
            email: data.email,
            phone: data.phoneNumber,
            position: data.position ?? data.role,
            role: data.role,
            isActive: true,
            department,
            user: savedUser,
          });
          const savedEmployee = await manager.save(Employee, employee);

          return { savedUser, savedEmployee };
        },
      );

    this.eventEmitter.emit('user.changed');
    this.eventEmitter.emit('audit.log.created', {
      userId: savedUser.id,
      action:
        data.role === Role.admin
          ? AuditAction.CREATE_ADMIN
          : AuditAction.CREATE_MANAGER,
      entity: 'User',
      entityId: String(savedUser.id),
      description: `Administrator created a ${data.role} account`,
      newValues: { username: savedUser.username, role: savedUser.role },
    });
    await this.cacheInvalidation.onEmployeeChanged(
      savedEmployee.id,
      savedUser.id,
    );
    await this.cacheInvalidation.invalidateAdminDashboard();
    await this.cacheInvalidation.invalidateAdminUsers();

    return { user: savedUser, employee: savedEmployee };
  }

  private async setActive(
    id: string,
    role: Role,
    isActive: boolean,
  ): Promise<SafeUser> {
    const user = await this.userRepository.findOne({
      where: { id, role },
      relations: ['employee'],
    });
    if (!user) {
      throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);
    }

    if (user.isActive === isActive) {
      return this.sanitizeWithRelations(id, role);
    }

    // Deactivating must invalidate any existing sessions/tokens.
    if (!isActive) {
      await this.sessionService.revokeAllSessions(id);
      user.tokenVersion += 1;
    }

    user.isActive = isActive;
    if (user.employee) {
      user.employee.isActive = isActive;
      await this.employeeRepository.save(user.employee);
    }
    const updated = await this.userRepository.save(user);

    await this.cacheInvalidation.invalidateAdminDashboard();
    await this.cacheInvalidation.invalidateAdminUsers();

    this.eventEmitter.emit('audit.log.created', {
      userId: id,
      action: isActive
        ? role === Role.admin
          ? AuditAction.ACTIVATE_ADMIN
          : AuditAction.ACTIVATE_MANAGER
        : role === Role.admin
          ? AuditAction.DEACTIVATE_ADMIN
          : AuditAction.DEACTIVATE_MANAGER,
      entity: 'User',
      entityId: String(id),
      description: `Administrator ${isActive ? 'activated' : 'deactivated'} a ${role} account`,
      newValues: { isActive },
    });

    const label = role === Role.admin ? 'administrator' : 'manager';
    await this.notify(
      String(id),
      isActive ? 'Account activated' : 'Account deactivated',
      `Your ${label} account has been ${isActive ? 'activated' : 'deactivated'} by an administrator.`,
    );

    return this.sanitizeWithRelations(updated.id);
  }

  /**
   * Applies page/limit/search/status/department filters at the database level
   * and returns a consistent pagination envelope.
   */
  private async paginate(
    qb: SelectQueryBuilder<User>,
    query: AdminQueryDto,
  ): Promise<PaginatedUsers> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    if (query.search) {
      qb.andWhere(
        '(user.username ILIKE :search OR employee.fullName ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    if (query.status) {
      qb.andWhere('user.isActive = :isActive', {
        isActive: query.status === AdminListStatus.ACTIVE,
      });
    }

    if (query.departmentId) {
      qb.andWhere('employee.departmentId = :departmentId', {
        departmentId: query.departmentId,
      });
    }

    const [items, total] = await qb
      .orderBy('employee.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: items.map((user) => this.sanitize(user)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private async sanitizeWithRelations(
    id: string,
    role?: Role,
  ): Promise<SafeUser> {
    const where: { id: string; role?: Role } = { id };
    if (role) {
      where.role = role;
    }
    const user = await this.userRepository.findOne({
      where,
      relations: ['employee', 'employee.department'],
    });
    if (!user) {
      throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);
    }
    return this.sanitize(user);
  }

  private sanitize(user: User): SafeUser {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...safe } = user;
    breakEmployeeUserCycle(safe.employee);
    return safe as SafeUser;
  }
}
