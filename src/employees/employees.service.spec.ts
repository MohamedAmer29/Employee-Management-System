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
import { RedisService } from '../redis/redis.service';
import { CacheInvalidationService } from '../redis/cache-invalidation.service';

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
    createQueryBuilder: jest.Mock;
    save: jest.Mock;
    remove: jest.Mock;
  };
  let departmentRepository: { findOne: jest.Mock };
  let userRepository: { findOne: jest.Mock; save: jest.Mock };
  let eventEmitter: { emit: jest.Mock };
  let redisService: {
    remember: jest.Mock;
    rememberWithLock: jest.Mock;
    getJson: jest.Mock;
    setJson: jest.Mock;
  };
  let cacheInvalidation: {
    onEmployeeChanged: jest.Mock;
    onDepartmentChanged: jest.Mock;
    invalidateDepartment: jest.Mock;
    invalidateEmployee: jest.Mock;
  };

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
      createQueryBuilder: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
    };
    departmentRepository = { findOne: jest.fn() };
    userRepository = { findOne: jest.fn(), save: jest.fn() };
    eventEmitter = { emit: jest.fn() };
    redisService = {
      remember: jest
        .fn()
        .mockImplementation(
          <T>(_key: string, _ttl: number, loader: () => Promise<T>) => loader(),
        ),
      rememberWithLock: jest
        .fn()
        .mockImplementation(
          <T>(
            _key: string,
            _lockKey: string,
            _ttl: number,
            loader: () => Promise<T>,
          ) => loader(),
        ),
      getJson: jest.fn(),
      setJson: jest.fn(),
    };
    cacheInvalidation = {
      onEmployeeChanged: jest.fn(),
      onDepartmentChanged: jest.fn(),
      invalidateDepartment: jest.fn(),
      invalidateEmployee: jest.fn(),
    };

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
        { provide: RedisService, useValue: redisService },
        { provide: CacheInvalidationService, useValue: cacheInvalidation },
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
      employeeRepository.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValue(employee);

      const result = await service.create(dto as any);

      expect(employeeRepository.findOne).toHaveBeenCalledWith({
        where: { email: 'jane@example.com' },
      });
      expect(departmentRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'dept-1' },
      });
      expect(employeeRepository.save).toHaveBeenCalled();
      expect(employeeRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'emp-1' },
        relations: ['department', 'user'],
      });
      expect(result).toMatchObject(employee);
    });

    it('should create an admin employee and assign the user account', async () => {
      const adminEmployee = {
        ...employee,
        role: Role.admin,
      } as unknown as Employee;
      const adminUser = {
        ...user,
        role: Role.admin,
        username: 'jane@example.com',
      } as unknown as User;
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
      employeeRepository.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValue(adminEmployee);
      userRepository.findOne.mockResolvedValue(adminUser);

      const result = await service.create(dto as any);

      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        relations: ['employee'],
      });
      expect(employeeRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ user: adminUser }),
      );
      expect(employeeRepository.save).toHaveBeenCalled();
      expect(userRepository.save).not.toHaveBeenCalled();
      expect(result).toMatchObject({ id: 'emp-1' });
    });

    it('should throw ConflictException when the user already has an employee', async () => {
      const dto = {
        fullName: 'Jane Doe',
        email: 'jane@example.com',
        phone: '5551234567',
        position: 'Developer',
        role: Role.admin,
        userId: 'user-1',
      };

      userRepository.findOne.mockResolvedValue({
        ...user,
        role: Role.admin,
        employee: employee,
      });

      await expect(service.create(dto as any)).rejects.toThrow(
        ConflictException,
      );
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
      employeeRepository.findOne.mockResolvedValueOnce(null);
      departmentRepository.findOne.mockResolvedValue(null);

      await expect(service.create(dto as any)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ConflictException when email already exists', async () => {
      const dto = {
        fullName: 'Jane Doe',
        email: 'jane@example.com',
        phone: '5551234567',
        position: 'Developer',
        role: Role.employee,
      };

      employeeRepository.findOne.mockResolvedValue(employee);

      await expect(service.create(dto as any)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw ConflictException when employee email does not match the user account email', async () => {
      const dto = {
        fullName: 'Jane Doe',
        email: 'jane@example.com',
        phone: '5551234567',
        position: 'Developer',
        role: Role.admin,
        userId: 'user-1',
      };

      userRepository.findOne.mockResolvedValue({
        ...user,
        role: Role.admin,
        username: 'other@example.com',
      });
      employeeRepository.findOne.mockResolvedValueOnce(null);

      await expect(service.create(dto as any)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('findAll / findOne', () => {
    it('should return all employees with relations', async () => {
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([employee]),
      };

      employeeRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as any,
      );

      const result = await service.findAll();

      expect(redisService.rememberWithLock).toHaveBeenCalledWith(
        'employees:list',
        'employees:list:lock',
        expect.any(Number),
        expect.any(Function),
        expect.any(Number),
      );
      expect(employeeRepository.createQueryBuilder).toHaveBeenCalledWith(
        'employee',
      );
      expect(mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
        'employee.department',
        'department',
      );
      expect(mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
        'employee.user',
        'user',
      );
      expect(mockQueryBuilder.select).toHaveBeenCalledWith(
        expect.arrayContaining([
          'employee.fullName',
          'department.id',
          'user.username',
        ]),
      );
      expect(mockQueryBuilder.select).toHaveBeenCalledWith(
        expect.not.arrayContaining(['user.password']),
      );
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
        'employee.createdAt',
        'DESC',
      );
      expect(result).toEqual([employee]);
    });

    it('should return an employee when found', async () => {
      employeeRepository.findOne.mockResolvedValue(employee);

      const result = await service.findOne('emp-1');

      expect(result).toMatchObject(employee);
      expect(result.user).not.toHaveProperty('password');
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
      employeeRepository.save.mockResolvedValue({
        ...adminEmployee,
        user: adminUser,
      });

      const result = await service.assignUser('emp-1', 'user-1');

      expect(employeeRepository.save).toHaveBeenCalled();
      expect(adminEmployee.user).toBe(adminUser);
      expect(userRepository.save).not.toHaveBeenCalled();
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
