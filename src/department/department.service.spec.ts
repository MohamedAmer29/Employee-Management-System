import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { DepartmentService } from './department.service';
import { Department } from './entities/department.entity';
import { Employee } from '../employees/entities/employee.entity';
import { RedisService } from '../redis/redis.service';
import { CacheInvalidationService } from '../redis/cache-invalidation.service';

describe('DepartmentService', () => {
  let service: DepartmentService;
  let departmentRepository: {
    create: jest.Mock;
    findOne: jest.Mock;
    find: jest.Mock;
    save: jest.Mock;
    remove: jest.Mock;
  };
  let employeeRepository: {
    findByIds: jest.Mock;
    save: jest.Mock;
  };

  const department = {
    id: 'dept-1',
    name: 'Engineering',
    description: 'Engineering dept',
    employees: [],
  } as unknown as Department;

  beforeEach(async () => {
    departmentRepository = {
      create: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
    };
    employeeRepository = {
      findByIds: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DepartmentService,
        {
          provide: getRepositoryToken(Department),
          useValue: departmentRepository,
        },
        { provide: getRepositoryToken(Employee), useValue: employeeRepository },
        {
          provide: RedisService,
          useValue: {
            remember: jest.fn(
              <T>(_key: string, _ttl: number, loader: () => Promise<T>) =>
                loader(),
            ),
            getJson: jest.fn().mockResolvedValue(null),
            setJson: jest.fn().mockResolvedValue(true),
          },
        },
        {
          provide: CacheInvalidationService,
          useValue: {
            onDepartmentChanged: jest.fn().mockResolvedValue(undefined),
            invalidateEmployee: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<DepartmentService>(DepartmentService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a department', async () => {
      departmentRepository.findOne.mockResolvedValue(null);
      departmentRepository.create.mockReturnValue(department);
      departmentRepository.save.mockResolvedValue(department);

      const result = await service.create({
        name: 'Engineering',
        description: 'Engineering dept',
      } as any);

      expect(departmentRepository.findOne).toHaveBeenCalledWith({
        where: { name: 'Engineering' },
      });
      expect(departmentRepository.save).toHaveBeenCalled();
      expect(result).toBe(department);
    });

    it('should throw ConflictException when name already exists', async () => {
      departmentRepository.findOne.mockResolvedValue(department);

      await expect(
        service.create({ name: 'Engineering' } as any),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll / findOne', () => {
    it('should return all departments with employees', async () => {
      departmentRepository.find.mockResolvedValue([department]);

      const result = await service.findAll();

      expect(departmentRepository.find).toHaveBeenCalledWith({
        relations: ['employees', 'employees.user'],
      });
      expect(result).toEqual([department]);
    });

    it('should return a department when found', async () => {
      departmentRepository.findOne.mockResolvedValue(department);

      const result = await service.findOne('dept-1');

      expect(result).toEqual(department);
    });

    it('should lift employee profile pictures and strip the user relation', async () => {
      departmentRepository.find.mockResolvedValue([
        {
          ...department,
          employees: [
            {
              id: 'emp-1',
              fullName: 'Jane Doe',
              user: {
                id: 'u-1',
                password: 'secret',
                profilePicture: 'https://img.example/pic.jpg',
              },
            },
          ] as unknown as Employee[],
        } as unknown as Department,
      ]);

      const result = await service.findAll();

      expect(result[0].employees).toEqual([
        {
          id: 'emp-1',
          fullName: 'Jane Doe',
          profilePicture: 'https://img.example/pic.jpg',
        },
      ]);
    });

    it('should throw NotFoundException when department not found', async () => {
      departmentRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update the department', async () => {
      departmentRepository.findOne.mockResolvedValue({ ...department });
      departmentRepository.save.mockResolvedValue({
        ...department,
        name: 'Engineering II',
      });

      const result = await service.update('dept-1', {
        name: 'Engineering II',
      } as any);

      expect(departmentRepository.save).toHaveBeenCalled();
      expect(result).toMatchObject({ name: 'Engineering II' });
    });

    it('should throw ConflictException when renaming to an existing name', async () => {
      departmentRepository.findOne
        .mockResolvedValueOnce({ ...department, name: 'Old Name' })
        .mockResolvedValue({ id: 'dept-2', name: 'Engineering' });

      await expect(
        service.update('dept-1', { name: 'Engineering' } as any),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('assignEmployees', () => {
    it('should return the department when no employee ids provided', async () => {
      departmentRepository.findOne.mockResolvedValue(department);

      const result = await service.assignEmployees('dept-1', []);

      expect(result).toBe(department);
      expect(employeeRepository.findByIds).not.toHaveBeenCalled();
    });

    it('should assign employees to the department', async () => {
      const employees = [
        { id: 'emp-1', department: undefined },
        { id: 'emp-2', department: undefined },
      ];
      departmentRepository.findOne.mockResolvedValue({
        ...department,
        employees: [],
      });
      employeeRepository.findByIds.mockResolvedValue(employees);
      employeeRepository.save.mockResolvedValue(undefined);
      departmentRepository.findOne.mockResolvedValue({
        ...department,
        employees,
      });

      const result = await service.assignEmployees('dept-1', [
        'emp-1',
        'emp-2',
      ]);

      expect(employeeRepository.findByIds).toHaveBeenCalledWith([
        'emp-1',
        'emp-2',
      ]);
      expect(employeeRepository.save).toHaveBeenCalledTimes(2);
      expect(result).toBeDefined();
    });

    it('should throw NotFoundException when an employee id is missing', async () => {
      departmentRepository.findOne.mockResolvedValue(department);
      employeeRepository.findByIds.mockResolvedValue([{ id: 'emp-1' }]);

      await expect(
        service.assignEmployees('dept-1', ['emp-1', 'emp-2']),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should remove an empty department', async () => {
      departmentRepository.findOne.mockResolvedValue({
        ...department,
        employees: [],
      });
      departmentRepository.remove.mockResolvedValue(department);

      const result = await service.remove('dept-1');

      expect(departmentRepository.remove).toHaveBeenCalled();
      expect(result).toEqual({ message: 'Department deleted' });
    });

    it('should throw ConflictException when employees are assigned', async () => {
      departmentRepository.findOne.mockResolvedValue({
        ...department,
        employees: [{ id: 'emp-1' }],
      });

      await expect(service.remove('dept-1')).rejects.toThrow(ConflictException);
    });
  });
});
