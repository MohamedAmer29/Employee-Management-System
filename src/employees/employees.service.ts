import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

type UploadedProfilePictureFile = {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
};

/**
 * Profile pictures live on the linked user account (the single source of
 * truth). Employee responses still expose them at the top level so the API
 * shape stays stable for the frontend.
 */
type EmployeeResponse = Employee & { profilePicture: string | null };
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Employee } from './entities/employee.entity';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { Department } from '../department/entities/department.entity';
import { User } from '../users/entities/user.entity';
import { Role } from '../auth/interfaces/Role.enum';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditAction } from '../audit-logs/enums/audit-action.enum';
import { EmployeeUpdatedEvent } from '../common/events/employee-updated.event';
import { RedisService } from '../redis/redis.service';
import { CacheInvalidationService } from '../redis/cache-invalidation.service';
import { CACHE_TTL, RedisKeys } from '../redis/redis.constants';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

@Injectable()
export class EmployeesService {
  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly eventEmitter: EventEmitter2,
    private readonly redisService: RedisService,
    private readonly cacheInvalidation: CacheInvalidationService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}
  async create(dto: CreateEmployeeDto) {
    let user: User | undefined;

    // An email can only belong to one employee. Registration links
    // employee.email to the user's login email, so a duplicate here signals a
    // data-integrity problem that would otherwise surface as a confusing
    // database error.
    console.log(dto);

    const employeeWithEmail = await this.employeeRepository.findOne({
      where: { email: dto.email },
    });
    if (employeeWithEmail) {
      throw new ConflictException('An employee with this email already exists');
    }

    // Resolve the linked user account before the employee row exists, so an
    // invalid userId never leaves an orphaned employee behind.
    if (dto.userId) {
      const foundUser = await this.userRepository.findOne({
        where: { id: dto.userId },
        relations: ['employee'],
      });

      if (!foundUser) {
        throw new NotFoundException('User account not found');
      }

      if (foundUser.employee) {
        throw new ConflictException('User already has an employee profile.');
      }

      // if (dto.role !== Role.admin && dto.role !== Role.manager) {
      //   throw new BadRequestException(
      //     `Only Admin and Manager employees can be assigned a user account (received role: "${dto.role}")`,
      //   );
      // }

      if (foundUser.role !== dto.role) {
        throw new ConflictException('User role must match the employee role');
      }

      // The employee's contact email must match the linked account's login
      // email, keeping the employee profile consistent with the credentials
      // the account uses to sign in.
      if (foundUser.username !== dto.email) {
        throw new ConflictException(
          'Employee email must match the user account email',
        );
      }

      user = foundUser;
    }

    const employee = this.employeeRepository.create({
      fullName: dto.fullName,
      email: dto.email,
      phone: dto.phone,
      position: dto.position,
      isActive: dto.isActive ?? true,
      role: dto.role ?? 'Employee',
      user,
    });

    if (dto.departmentId) {
      const department = await this.departmentRepository.findOne({
        where: { id: dto.departmentId },
      });
      if (!department) {
        throw new NotFoundException('Department not found');
      }
      employee.department = department;
    }

    const savedEmployee = await this.employeeRepository.save(employee);

    await this.cacheInvalidation.onEmployeeChanged(
      savedEmployee.id,
      dto.userId,
    );

    return this.findOne(savedEmployee.id);
  }

  /**
   * Admin list of all employees. Runs behind a Redis lock so a cache expiry
   * never causes a stampede of concurrent PostgreSQL scans, and explicitly
   * selects only the columns the admin list needs - sensitive user data such
   * as the password hash, nationalId or tokenVersion is never loaded or
   * cached. Rows are returned in a deterministic order.
   */
  findAll(): Promise<EmployeeResponse[]> {
    return this.redisService.rememberWithLock(
      RedisKeys.employeesList(),
      RedisKeys.employeesListLock(),
      CACHE_TTL.EMPLOYEES_LIST,
      () =>
        this.employeeRepository
          .createQueryBuilder('employee')
          .leftJoinAndSelect('employee.department', 'department')
          .leftJoinAndSelect('employee.user', 'user')
          .select([
            'employee.id',
            'employee.isActive',
            'employee.fullName',
            'employee.email',
            'employee.phone',
            'employee.position',
            'employee.role',
            'employee.createdAt',
            'department.id',
            'department.name',
            'user.id',
            'user.firstName',
            'user.lastName',
            'user.username',
            'user.role',
            'user.profilePicture',
          ])
          .orderBy('employee.createdAt', 'DESC')
          .getMany()
          .then((employees) => employees.map((e) => this.toCacheable(e))),
      CACHE_TTL.LOCK,
    );
  }

  /**
   * Cache-aside read. On a cache hit the cached employee is returned, on a miss
   * PostgreSQL is queried and the result stored for CACHE_TTL.EMPLOYEE seconds.
   * If Redis is unavailable the query falls through to PostgreSQL transparently.
   */
  async findOne(id: string): Promise<EmployeeResponse> {
    const cached = await this.redisService.getJson<EmployeeResponse>(
      RedisKeys.employee(id),
    );

    if (cached) {
      return cached;
    }

    const employee = await this.employeeRepository.findOne({
      where: { id },
      relations: ['department', 'user'],
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    await this.redisService.setJson(
      RedisKeys.employee(id),
      this.toCacheable(employee),
      CACHE_TTL.EMPLOYEE,
    );

    return this.toCacheable(employee);
  }

  /**
   * Always reads from PostgreSQL. Used by write paths so mutations never
   * operate on a cached (possibly detached) entity.
   */
  private async findOneFresh(id: string): Promise<Employee> {
    const employee = await this.employeeRepository.findOne({
      where: { id },
      relations: ['department', 'user'],
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    return employee;
  }

  /**
   * Strips the password hash from the nested user relation and lifts the
   * profile picture (which lives on the user) up to the employee top level.
   * Credentials must never be written to Redis or returned to the client, so
   * every public read and write response is passed through this helper.
   */
  private toCacheable(employee: Employee): EmployeeResponse {
    const profilePicture = employee.user?.profilePicture ?? null;

    if (!employee.user) {
      return { ...employee, profilePicture };
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...safeUser } = employee.user;

    return {
      ...employee,
      profilePicture,
      user: safeUser as User,
    };
  }

  async update(id: string, dto: UpdateEmployeeDto, userId?: string) {
    const employee = await this.findOneFresh(id);
    const previousDepartmentId = employee.department?.id;

    const oldValues: Record<string, unknown> = {};
    if (dto.fullName) oldValues.fullName = employee.fullName;
    if (dto.email) oldValues.email = employee.email;
    if (dto.phone) oldValues.phone = employee.phone;
    if (dto.position) oldValues.position = employee.position;

    Object.assign(employee, dto);

    if (dto.departmentId) {
      const department = await this.departmentRepository.findOne({
        where: { id: dto.departmentId },
      });
      if (!department) {
        throw new NotFoundException('Department not found');
      }
      employee.department = department;
    }

    const updatedEmployee = await this.employeeRepository.save(employee);

    const employeeUser = await this.userRepository.findOne({
      where: { employee: { id: employee.id } },
    });

    await this.cacheInvalidation.onEmployeeChanged(id, employeeUser?.id);

    if (dto.departmentId && dto.departmentId !== previousDepartmentId) {
      await this.cacheInvalidation.onDepartmentChanged(dto.departmentId);

      if (previousDepartmentId) {
        await this.cacheInvalidation.invalidateDepartment(previousDepartmentId);
      }
    }

    if (employeeUser) {
      this.eventEmitter.emit(
        'employee.updated',
        new EmployeeUpdatedEvent(employeeUser.id, employee.fullName),
      );
    }

    this.eventEmitter.emit('audit.log.created', {
      userId,
      action: AuditAction.UPDATE,
      entity: 'Employee',
      entityId: String(updatedEmployee.id),
      description: 'Employee information updated',
      oldValues,
      newValues: dto,
    });

    return this.toCacheable(updatedEmployee);
  }

  async remove(id: string) {
    const employee = await this.findOneFresh(id);
    const departmentId = employee.department?.id;
    const employeeUserId = employee.user?.id;

    await this.employeeRepository.remove(employee);

    await this.cacheInvalidation.onEmployeeChanged(id, employeeUserId);

    if (departmentId) {
      await this.cacheInvalidation.invalidateDepartment(departmentId);
    }

    return { message: 'Employee deleted' };
  }

  async assignDepartment(id: string, departmentId: string) {
    const employee = await this.findOneFresh(id);
    const previousDepartmentId = employee.department?.id;
    const department = await this.departmentRepository.findOne({
      where: { id: departmentId },
    });

    if (!department) {
      throw new NotFoundException('Department not found');
    }

    employee.department = department;
    const saved = await this.employeeRepository.save(employee);

    await this.cacheInvalidation.onEmployeeChanged(id, employee.user?.id);
    await this.cacheInvalidation.onDepartmentChanged(departmentId);

    if (previousDepartmentId && previousDepartmentId !== departmentId) {
      await this.cacheInvalidation.invalidateDepartment(previousDepartmentId);
    }

    return this.toCacheable(saved);
  }

  async assignUser(id: string, userId: string) {
    const employee = await this.findOneFresh(id);
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['employee'],
    });

    if (!user) {
      throw new NotFoundException('User account not found');
    }

    // A user may only be linked to one employee (employees.userId is unique).
    if (user.employee && user.employee.id !== employee.id) {
      throw new ConflictException('User already has an employee profile.');
    }

    if (employee.role !== Role.admin && employee.role !== Role.manager) {
      throw new BadRequestException(
        `Only Admin and Manager employees can be assigned a user account (received role: "${employee.role}")`,
      );
    }

    if (user.role !== employee.role) {
      throw new ConflictException('User role must match the employee role');
    }

    employee.user = user;
    const saved = await this.employeeRepository.save(employee);

    await this.cacheInvalidation.onEmployeeChanged(id, userId);

    return this.toCacheable(saved);
  }

  async uploadProfilePicture(id: string, file: UploadedProfilePictureFile) {
    const employee = await this.findOneFresh(id);

    if (!employee.user) {
      throw new BadRequestException(
        'Employee must have a linked user account to set a profile picture',
      );
    }

    await this.saveUserProfilePicture(employee.user, file);
    await this.cacheInvalidation.invalidateEmployee(employee.id);

    return this.toCacheable(employee);
  }

  async uploadMyProfilePicture(
    userId: string,
    file: UploadedProfilePictureFile,
  ) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['employee'],
    });

    if (!user || !user.employee) {
      throw new NotFoundException('Employee not found for current user');
    }

    await this.saveUserProfilePicture(user, file);

    const employee = await this.findOneFresh(user.employee.id);
    await this.cacheInvalidation.invalidateEmployee(employee.id);

    return this.toCacheable(employee);
  }

  /**
   * Profile pictures live on the user account (the single source of truth),
   * so both employee upload endpoints write here.
   */
  private async saveUserProfilePicture(
    user: User,
    file: UploadedProfilePictureFile,
  ): Promise<void> {
    if (!file) {
      throw new BadRequestException('Profile picture file is required');
    }

    const profilePicture = await this.cloudinaryService.uploadImage(file);

    if (user.profilePicture) {
      await this.cloudinaryService.deleteImage(user.profilePicture);
    }

    user.profilePicture = profilePicture;
    await this.userRepository.save(user);
    this.eventEmitter.emit('user.changed');
  }
}
