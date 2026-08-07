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

    return this.findOne(savedEmployee.id);
  }

  findAll() {
    return this.employeeRepository.find({
      relations: ['department', 'user'],
    });
  }

  async findOne(id: string) {
    const employee = await this.employeeRepository.findOne({
      where: { id },
      relations: ['department', 'user'],
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    return employee;
  }

  async update(id: string, dto: UpdateEmployeeDto) {
    const employee = await this.findOne(id);

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

    return this.employeeRepository.save(employee);
  }

  async remove(id: string) {
    const employee = await this.findOne(id);
    await this.employeeRepository.remove(employee);
    return { message: 'Employee deleted' };
  }

  async assignDepartment(id: string, departmentId: string) {
    const employee = await this.findOne(id);
    const department = await this.departmentRepository.findOne({
      where: { id: departmentId },
    });

    if (!department) {
      throw new NotFoundException('Department not found');
    }

    employee.department = department;
    return this.employeeRepository.save(employee);
  }

  async assignUser(id: string, userId: string) {
    const employee = await this.findOne(id);
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
    return this.employeeRepository.save(employee);
  }

  async uploadProfilePicture(id: string, file: UploadedProfilePictureFile) {
    const employee = await this.findOne(id);

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

    return employee;
  }
}
