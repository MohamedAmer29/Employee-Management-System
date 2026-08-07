import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { Employee } from './entities/employee.entity';
import { Department } from '../department/entities/department.entity';
import { User } from '../users/entities/user.entity';
import { Role } from '../auth/interfaces/Role.enum';

jest.mock('fs', () => ({
  ...jest.requireActual<typeof import('fs')>('fs'),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

import * as fs from 'fs';

describe('EmployeesService', () => {
  let service: EmployeesService;
  let employeeRepository: {
    create: jest.Mock;
    findOne: jest.Mock;
    find: jest.Mock;
    save: jest.Mock;
    remove: jest.Mock;
  };
  let departmentRepository: { findOne: jest.Mock };
  let userRepository: { findOne: jest.Mock; save: jest.Mock };
  let eventEmitter: { emit: jest.Mock };

  const department = { id: 'dept-1', name: 'Engineering' } as Department;
  const user = { id: 'user-1', role: Role.employee } as unknown as User;
  const employee = {
    id: 'emp-1',
    fullName: 'Jane Doe',
    email: 'jane@example.com',
    phone: '5551234567',
    position: 'Developer',
    isActive: true,
    role: Role.employee,
    department,
    user,
  } as unknown as Employee;

  beforeEach(async () => {
    employeeRepository = {
      create: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
    };
    departmentRepository = { findOne: jest.fn() };
    userRepository = { findOne: jest.fn(), save: jest.fn() };
    eventEmitter = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmployeesService,
        { provide: getRepositoryToken(Employee), useValue: employeeRepository },
        {
          provide: getRepositoryToken(Department),
          useValue: departmentRepository,
        },
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<EmployeesService>(EmployeesService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create an employee with a department', async () => {
      const dto = {
        fullName: 'Jane Doe',
        email: 'jane@example.com',
        phone: '5551234567',
        position: 'Developer',
        role: Role.employee,
        departmentId: 'dept-1',
      };

      employeeRepository.create.mockReturnValue(employee);
      departmentRepository.findOne.mockResolvedValue(department);
      employeeRepository.save.mockResolvedValue(employee);
      employeeRepository.findOne.mockResolvedValue(employee);

      const result = await service.create(dto as any);

      expect(departmentRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'dept-1' },
      });
      expect(employeeRepository.save).toHaveBeenCalled();
      expect(employeeRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'emp-1' },
        relations: ['department', 'user'],
      });
      expect(result).toBe(employee);
    });

    it('should create an admin employee and assign the user account', async () => {
      const adminEmployee = {
        ...employee,
        role: Role.admin,
      } as unknown as Employee;
      const adminUser = { ...user, role: Role.admin } as unknown as User;
      const dto = {
        fullName: 'Jane Doe',
        email: 'jane@example.com',
        phone: '5551234567',
        position: 'Developer',
        role: Role.admin,
        userId: 'user-1',
      };

      employeeRepository.create.mockReturnValue(adminEmployee);
      employeeRepository.save.mockResolvedValue(adminEmployee);
      employeeRepository.findOne.mockResolvedValue(adminEmployee);
      userRepository.findOne.mockResolvedValue(adminUser);
      userRepository.save.mockResolvedValue(adminUser);

      const result = await service.create(dto as any);

      expect(employeeRepository.save).toHaveBeenCalled();
      expect(userRepository.save).toHaveBeenCalled();
      expect(result).toBe(adminEmployee);
    });

    it('should throw NotFoundException when department does not exist', async () => {
      const dto = {
        fullName: 'Jane Doe',
        email: 'jane@example.com',
        phone: '5551234567',
        position: 'Developer',
        role: Role.employee,
        departmentId: 'missing',
      };

      employeeRepository.create.mockReturnValue({ ...employee });
      departmentRepository.findOne.mockResolvedValue(null);

      await expect(service.create(dto as any)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findAll / findOne', () => {
    it('should return all employees with relations', async () => {
      employeeRepository.find.mockResolvedValue([employee]);

      const result = await service.findAll();

      expect(employeeRepository.find).toHaveBeenCalledWith({
        relations: ['department', 'user'],
      });
      expect(result).toEqual([employee]);
    });

    it('should return an employee when found', async () => {
      employeeRepository.findOne.mockResolvedValue(employee);

      const result = await service.findOne('emp-1');

      expect(result).toBe(employee);
    });

    it('should throw NotFoundException when employee not found', async () => {
      employeeRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update employee and emit events', async () => {
      employeeRepository.findOne.mockResolvedValue({ ...employee });
      departmentRepository.findOne.mockResolvedValue(department);
      employeeRepository.save.mockResolvedValue({ ...employee, phone: '999' });
      userRepository.findOne.mockResolvedValue(user);

      const result = await service.update('emp-1', { phone: '999' } as any);

      expect(employeeRepository.save).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'employee.updated',
        expect.any(Object),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'audit.log.created',
        expect.objectContaining({ entity: 'Employee' }),
      );
      expect(result).toMatchObject({ phone: '999' });
    });

    it('should throw NotFoundException when department does not exist', async () => {
      employeeRepository.findOne.mockResolvedValue({ ...employee });
      departmentRepository.findOne.mockResolvedValue(null);

      await expect(
        service.update('emp-1', { departmentId: 'missing' } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should remove the employee and return a message', async () => {
      employeeRepository.findOne.mockResolvedValue(employee);
      employeeRepository.remove.mockResolvedValue(employee);

      const result = await service.remove('emp-1');

      expect(employeeRepository.remove).toHaveBeenCalledWith(employee);
      expect(result).toEqual({ message: 'Employee deleted' });
    });
  });

  describe('assignDepartment', () => {
    it('should assign a department to the employee', async () => {
      employeeRepository.findOne.mockResolvedValue({
        ...employee,
        department: undefined,
      });
      departmentRepository.findOne.mockResolvedValue(department);
      employeeRepository.save.mockResolvedValue({ ...employee, department });

      const result = await service.assignDepartment('emp-1', 'dept-1');

      expect(employeeRepository.save).toHaveBeenCalled();
      expect(result.department).toBe(department);
    });

    it('should throw NotFoundException when department not found', async () => {
      employeeRepository.findOne.mockResolvedValue(employee);
      departmentRepository.findOne.mockResolvedValue(null);

      await expect(
        service.assignDepartment('emp-1', 'missing'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('assignUser', () => {
    it('should throw NotFoundException when user not found', async () => {
      employeeRepository.findOne.mockResolvedValue(employee);
      userRepository.findOne.mockResolvedValue(null);

      await expect(service.assignUser('emp-1', 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException for non-admin/manager employees', async () => {
      employeeRepository.findOne.mockResolvedValue(employee);
      userRepository.findOne.mockResolvedValue(user);

      await expect(service.assignUser('emp-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw ConflictException when roles do not match', async () => {
      const adminEmployee = {
        ...employee,
        role: Role.admin,
      } as unknown as Employee;
      employeeRepository.findOne.mockResolvedValue(adminEmployee);
      userRepository.findOne.mockResolvedValue({
        ...user,
        role: Role.employee,
      });

      await expect(service.assignUser('emp-1', 'user-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('should assign the user when roles match', async () => {
      const adminEmployee = {
        ...employee,
        role: Role.admin,
      } as unknown as Employee;
      const adminUser = { ...user, role: Role.admin } as unknown as User;
      employeeRepository.findOne.mockResolvedValue(adminEmployee);
      userRepository.findOne.mockResolvedValue(adminUser);
      userRepository.save.mockResolvedValue(adminUser);
      employeeRepository.save.mockResolvedValue({
        ...adminEmployee,
        user: adminUser,
      });

      const result = await service.assignUser('emp-1', 'user-1');

      expect(userRepository.save).toHaveBeenCalledWith(adminUser);
      expect(result).toMatchObject({ user: adminUser });
    });
  });

  describe('uploadProfilePicture', () => {
    const file = {
      fieldname: 'profilePicture',
      originalname: 'photo.png',
      encoding: '7bit',
      mimetype: 'image/png',
      buffer: Buffer.from('fake-image'),
      size: 10,
    };

    it('should throw BadRequestException when no file provided', async () => {
      employeeRepository.findOne.mockResolvedValue(employee);

      await expect(
        service.uploadProfilePicture('emp-1', undefined as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for non-employee roles', async () => {
      const adminEmployee = {
        ...employee,
        role: Role.admin,
      } as unknown as Employee;
      employeeRepository.findOne.mockResolvedValue(adminEmployee);

      await expect(service.uploadProfilePicture('emp-1', file)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should save the file and update the profile picture', async () => {
      employeeRepository.findOne.mockResolvedValue(employee);
      employeeRepository.save.mockResolvedValue(employee);

      const result = await service.uploadProfilePicture('emp-1', file);

      expect(fs.mkdirSync).toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalled();
      expect(result.profilePicture).toContain('/uploads/profile-pictures/');
      expect(employeeRepository.save).toHaveBeenCalled();
    });
  });
});
