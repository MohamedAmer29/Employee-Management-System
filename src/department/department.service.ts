import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Department } from './entities/department.entity';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { Employee } from '../employees/entities/employee.entity';
import { RedisService } from '../redis/redis.service';
import { CacheInvalidationService } from '../redis/cache-invalidation.service';
import { CACHE_TTL, RedisKeys } from '../redis/redis.constants';

type DepartmentEmployeeResponse = Omit<Employee, 'user'> & {
  profilePicture: string | null;
};

type DepartmentResponse = Omit<Department, 'employees'> & {
  employees: DepartmentEmployeeResponse[];
};

@Injectable()
export class DepartmentService {
  constructor(
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    private readonly redisService: RedisService,
    private readonly cacheInvalidation: CacheInvalidationService,
  ) {}

  async create(dto: CreateDepartmentDto) {
    await this.ensureNameIsUnique(dto.name);

    const department = this.departmentRepository.create(dto);
    const saved = await this.departmentRepository.save(department);

    await this.cacheInvalidation.onDepartmentChanged(saved.id);

    return saved;
  }

  findAll(): Promise<DepartmentResponse[]> {
    return this.redisService.remember(
      RedisKeys.departmentsList(),
      CACHE_TTL.DEPARTMENTS_LIST,
      async () => {
        const departments = await this.departmentRepository.find({
          relations: ['employees', 'employees.user'],
        });
        return departments.map((department) => this.toResponse(department));
      },
    );
  }

  /**
   * Cache-aside read for a single department. Falls back to PostgreSQL on a
   * cache miss or whenever Redis is unavailable.
   */
  async findOne(id: string): Promise<DepartmentResponse> {
    const cached = await this.redisService.getJson<DepartmentResponse>(
      RedisKeys.department(id),
    );

    if (cached) {
      return cached;
    }

    const department = await this.findOneFresh(id);
    const response = this.toResponse(department);

    await this.redisService.setJson(
      RedisKeys.department(id),
      response,
      CACHE_TTL.DEPARTMENT,
    );

    return response;
  }

  private async findOneFresh(id: string): Promise<Department> {
    const department = await this.departmentRepository.findOne({
      where: { id },
      relations: ['employees', 'employees.user'],
    });

    if (!department) {
      throw new NotFoundException('Department not found');
    }

    return department;
  }

  /**
   * Lifts each employee's profile picture (which lives on the linked user
   * account) up to the employee top level and strips the nested user relation
   * so credentials and other user fields are never returned to the client or
   * written to Redis.
   */
  private toResponse(department: Department): DepartmentResponse {
    return {
      ...department,
      employees: (department.employees ?? []).map(({ user, ...employee }) => ({
        ...employee,
        profilePicture: user?.profilePicture ?? null,
      })),
    };
  }

  async update(id: string, dto: UpdateDepartmentDto) {
    const department = await this.findOneFresh(id);

    if (dto.name && dto.name !== department.name) {
      await this.ensureNameIsUnique(dto.name, id);
    }

    Object.assign(department, dto);
    const saved = await this.departmentRepository.save(department);

    await this.cacheInvalidation.onDepartmentChanged(id);

    return this.toResponse(saved);
  }

  async assignEmployees(id: string, employeeIds: string[]) {
    const department = await this.findOneFresh(id);

    if (!employeeIds?.length) {
      return department;
    }

    const employees = await this.employeeRepository.findByIds(employeeIds);

    if (employees.length !== employeeIds.length) {
      throw new NotFoundException('One or more employee IDs were not found');
    }

    for (const employee of employees) {
      employee.department = department;
      await this.employeeRepository.save(employee);
    }

    // Department assignment changed: invalidate the department, the employees
    // list and every affected employee cache entry.
    await this.cacheInvalidation.onDepartmentChanged(id);
    await Promise.all(
      employees.map((employee) =>
        this.cacheInvalidation.invalidateEmployee(employee.id),
      ),
    );

    return this.findOne(id);
  }

  async remove(id: string) {
    const department = await this.findOneFresh(id);

    if (department.employees?.length) {
      throw new ConflictException(
        'Cannot delete department because employees are assigned to it',
      );
    }

    await this.departmentRepository.remove(department);

    await this.cacheInvalidation.onDepartmentChanged(id);

    return { message: 'Department deleted' };
  }

  private async ensureNameIsUnique(name: string, excludeId?: string) {
    const existingDepartment = await this.departmentRepository.findOne({
      where: { name },
    });

    if (existingDepartment && existingDepartment.id !== excludeId) {
      throw new ConflictException('Department name already exists');
    }
  }
}
