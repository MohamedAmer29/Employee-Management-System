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
import * as fs from 'fs';
import * as path from 'path';

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
  ) {}

  async create(dto: CreateEmployeeDto) {
    const employee = this.employeeRepository.create({
      fullName: dto.fullName,
      email: dto.email,
      phone: dto.phone,
      position: dto.position,
      isActive: dto.isActive ?? true,
      role: dto.role,
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

    if (dto.userId) {
      await this.assignUser(savedEmployee.id, dto.userId);
    }

    await this.cacheInvalidation.onEmployeeChanged(
      savedEmployee.id,
      dto.userId,
    );

    return this.findOne(savedEmployee.id);
  }

  findAll(): Promise<Employee[]> {
    return this.redisService.remember(
      RedisKeys.employeesList(),
      CACHE_TTL.EMPLOYEES_LIST,
      () =>
        this.employeeRepository.find({
          relations: ['department', 'user'],
        }),
    );
  }

  /**
   * Cache-aside read. On a cache hit the cached employee is returned, on a miss
   * PostgreSQL is queried and the result stored for CACHE_TTL.EMPLOYEE seconds.
   * If Redis is unavailable the query falls through to PostgreSQL transparently.
   */
  async findOne(id: string): Promise<Employee> {
    const cached = await this.redisService.getJson<Employee>(
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

    return employee;
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
   * Strips the password hash from the nested user relation before caching.
   * Credentials must never be written to Redis.
   */
  private toCacheable(employee: Employee): Employee {
    if (!employee.user) {
      return employee;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...safeUser } = employee.user;

    return {
      ...employee,
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

    return updatedEmployee;
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

    return saved;
  }

  async assignUser(id: string, userId: string) {
    const employee = await this.findOneFresh(id);
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User account not found');
    }

    if (employee.role !== Role.admin && employee.role !== Role.manager) {
      throw new BadRequestException(
        'Only Admin and Manager employees can be assigned a user account',
      );
    }

    if (user.role !== employee.role) {
      throw new ConflictException('User role must match the employee role');
    }

    employee.user = user;
    user.employee = employee;
    await this.userRepository.save(user);
    const saved = await this.employeeRepository.save(employee);

    await this.cacheInvalidation.onEmployeeChanged(id, userId);

    return saved;
  }

  async uploadProfilePicture(id: string, file: UploadedProfilePictureFile) {
    const employee = await this.findOneFresh(id);

    return this.saveProfilePicture(employee, file);
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

    const employee = await this.employeeRepository.findOne({
      where: { id: user.employee.id },
      relations: ['department', 'user'],
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    return this.saveProfilePicture(employee, file);
  }

  private async saveProfilePicture(
    employee: Employee,
    file: UploadedProfilePictureFile,
  ) {
    if (!file) {
      throw new BadRequestException('Profile picture file is required');
    }

    if (employee.role !== Role.employee) {
      throw new BadRequestException(
        'Profile picture upload is only allowed for Employee role',
      );
    }

    const uploadDir = path.join(process.cwd(), 'uploads', 'profile-pictures');
    fs.mkdirSync(uploadDir, { recursive: true });

    const fileName = `${Date.now()}-${file.originalname}`;
    const filePath = path.join(uploadDir, fileName);
    fs.writeFileSync(filePath, file.buffer);

    employee.profilePicture = `/uploads/profile-pictures/${fileName}`;
    await this.employeeRepository.save(employee);

    await this.cacheInvalidation.invalidateEmployee(employee.id);

    return employee;
  }
}
