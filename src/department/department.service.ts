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

@Injectable()
export class DepartmentService {
  constructor(
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
  ) {}

  async create(dto: CreateDepartmentDto) {
    await this.ensureNameIsUnique(dto.name);

    const department = this.departmentRepository.create(dto);
    return this.departmentRepository.save(department);
  }

  findAll() {
    return this.departmentRepository.find({ relations: ['employees'] });
  }

  async findOne(id: string) {
    const department = await this.departmentRepository.findOne({
      where: { id },
      relations: ['employees'],
    });

    if (!department) {
      throw new NotFoundException('Department not found');
    }

    return department;
  }

  async update(id: string, dto: UpdateDepartmentDto) {
    const department = await this.findOne(id);

    if (dto.name && dto.name !== department.name) {
      await this.ensureNameIsUnique(dto.name, id);
    }

    Object.assign(department, dto);
    return this.departmentRepository.save(department);
  }

  async assignEmployees(id: string, employeeIds: string[]) {
    const department = await this.findOne(id);

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

    return this.findOne(id);
  }

  async remove(id: string) {
    const department = await this.findOne(id);

    if (department.employees?.length) {
      throw new ConflictException(
        'Cannot delete department because employees are assigned to it',
      );
    }

    await this.departmentRepository.remove(department);
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
