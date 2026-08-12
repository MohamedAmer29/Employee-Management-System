import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { LeaveService } from './leave.service';
import { LeaveRequest } from './entities/leave.entity';
import { User } from '../users/entities/user.entity';
import { Employee } from '../employees/entities/employee.entity';
import { LeaveStatus } from './interfaces/leave.status';
import { Role } from '../auth/interfaces/Role.enum';

describe('LeaveService', () => {
  let service: LeaveService;
  let leaveRepository: {
    create: jest.Mock;
    findOne: jest.Mock;
    find: jest.Mock;
    save: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let userRepository: { findOne: jest.Mock };
  let employeeRepository: { findOne: jest.Mock };
  let eventEmitter: { emit: jest.Mock };

  const employee = {
    id: 'emp-1',
    fullName: 'Jane Doe',
  } as unknown as Employee;

  const user = { id: 'user-1', employee } as unknown as User;

  const leave = {
    id: 1,
    employee,
    reason: 'Vacation',
    startDate: '2026-08-10',
    endDate: '2026-08-12',
    status: LeaveStatus.PENDING,
  } as unknown as LeaveRequest;

  const queryBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
  };

  beforeEach(async () => {
    leaveRepository = {
      create: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };
    userRepository = { findOne: jest.fn() };
    employeeRepository = { findOne: jest.fn() };
    eventEmitter = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeaveService,
        {
          provide: getRepositoryToken(LeaveRequest),
          useValue: leaveRepository,
        },
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: getRepositoryToken(Employee), useValue: employeeRepository },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<LeaveService>(LeaveService);
    jest.clearAllMocks();
    queryBuilder.getOne.mockReset();
    queryBuilder.getOne.mockResolvedValue(null);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('requestLeave', () => {
    const dto = {
      reason: 'Vacation',
      startDate: '2026-08-10',
      endDate: '2026-08-12',
    };

    it('should create a leave request successfully', async () => {
      userRepository.findOne.mockResolvedValue(user);
      leaveRepository.find.mockResolvedValue([]);
      leaveRepository.findOne.mockResolvedValue(null);
      leaveRepository.create.mockReturnValue(leave);
      leaveRepository.save.mockResolvedValue(leave);

      const result = await service.requestLeave('user-1', dto as any);

      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        relations: ['employee'],
      });
      expect(leaveRepository.save).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'leave.created',
        expect.any(Object),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'audit.log.created',
        expect.objectContaining({ entity: 'LeaveRequest' }),
      );
      expect(result).toBe(leave);
    });

    it('should throw NotFoundException when user has no employee record', async () => {
      userRepository.findOne.mockResolvedValue({
        id: 'user-1',
        employee: null,
      });

      await expect(service.requestLeave('user-1', dto as any)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException for invalid dates', async () => {
      userRepository.findOne.mockResolvedValue(user);

      await expect(
        service.requestLeave('user-1', {
          reason: 'Vacation',
          startDate: 'not-a-date',
          endDate: '2026-08-12',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when end date is before start date', async () => {
      userRepository.findOne.mockResolvedValue(user);

      await expect(
        service.requestLeave('user-1', {
          reason: 'Vacation',
          startDate: '2026-08-12',
          endDate: '2026-08-10',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException when leave balance is insufficient', async () => {
      userRepository.findOne.mockResolvedValue(user);
      leaveRepository.find.mockResolvedValue([
        { id: 1, startDate: '2026-01-01', endDate: '2026-01-31' },
      ]);

      await expect(
        service.requestLeave('user-1', {
          reason: 'Vacation',
          startDate: '2026-08-10',
          endDate: '2026-09-10',
        } as any),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException for a duplicate leave request', async () => {
      userRepository.findOne.mockResolvedValue(user);
      leaveRepository.find.mockResolvedValue([]);
      leaveRepository.findOne.mockResolvedValue(leave);

      await expect(service.requestLeave('user-1', dto as any)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw ConflictException for an overlapping leave request', async () => {
      userRepository.findOne.mockResolvedValue(user);
      leaveRepository.find.mockResolvedValue([]);
      leaveRepository.findOne.mockResolvedValue(null);
      queryBuilder.getOne.mockResolvedValue(leave);

      await expect(service.requestLeave('user-1', dto as any)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('updateLeaveStatus', () => {
    it('should throw NotFoundException when leave request not found', async () => {
      leaveRepository.findOne.mockResolvedValue(null);

      await expect(
        service.updateLeaveStatus('1', LeaveStatus.APPROVED),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when status is unchanged', async () => {
      leaveRepository.findOne.mockResolvedValue({
        ...leave,
        status: LeaveStatus.APPROVED,
      });

      await expect(
        service.updateLeaveStatus('1', LeaveStatus.APPROVED),
      ).rejects.toThrow(BadRequestException);
    });

    it('should approve a leave request and emit events', async () => {
      leaveRepository.findOne.mockResolvedValue({ ...leave });
      leaveRepository.save.mockResolvedValue({
        ...leave,
        status: LeaveStatus.APPROVED,
      });
      userRepository.findOne.mockResolvedValue(user);

      const result = await service.updateLeaveStatus(
        '1',
        LeaveStatus.APPROVED,
        'manager-1',
      );

      expect(leaveRepository.findOne).toHaveBeenCalledWith({
        where: { id: 1 },
        relations: ['employee'],
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'leave.approved',
        expect.any(Object),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'audit.log.created',
        expect.objectContaining({
          action: expect.any(String),
          entity: 'LeaveRequest',
        }),
      );
      expect(result.status).toBe(LeaveStatus.APPROVED);
    });

    it('should reject a leave request and emit events', async () => {
      leaveRepository.findOne.mockResolvedValue({ ...leave });
      leaveRepository.save.mockResolvedValue({
        ...leave,
        status: LeaveStatus.REJECTED,
      });
      userRepository.findOne.mockResolvedValue(user);

      const result = await service.updateLeaveStatus('1', LeaveStatus.REJECTED);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'leave.rejected',
        expect.any(Object),
      );
      expect(result.status).toBe(LeaveStatus.REJECTED);
    });
  });

  describe('findAll', () => {
    it('should return all leave requests for non-employees', async () => {
      leaveRepository.find.mockResolvedValue([leave]);

      const result = await service.findAll(Role.admin, 'user-1');

      expect(leaveRepository.find).toHaveBeenCalledWith({
        relations: ['employee', 'employee.user'],
      });
      expect(result).toEqual([
        {
          ...leave,
          employee: { id: 'emp-1', fullName: 'Jane Doe', profilePicture: null },
        },
      ]);
    });

    it('should return own leave requests for employees', async () => {
      userRepository.findOne.mockResolvedValue(user);
      leaveRepository.find.mockResolvedValue([leave]);

      const result = await service.findAll(Role.employee, 'user-1');

      expect(leaveRepository.find).toHaveBeenCalledWith({
        where: { employee: { id: 'emp-1' } },
        relations: ['employee', 'employee.user'],
      });
      expect(result).toEqual([
        {
          ...leave,
          employee: { id: 'emp-1', fullName: 'Jane Doe', profilePicture: null },
        },
      ]);
    });

    it('should lift the profile picture onto the employee object', async () => {
      const leaveWithUser = {
        ...leave,
        employee: {
          ...employee,
          user: { profilePicture: 'https://img.example/pic.jpg' },
        },
      } as unknown as LeaveRequest;
      leaveRepository.find.mockResolvedValue([leaveWithUser]);

      const result = await service.findAll(Role.admin, 'user-1');

      expect(result[0].employee).toEqual({
        id: 'emp-1',
        fullName: 'Jane Doe',
        profilePicture: 'https://img.example/pic.jpg',
      });
      expect((result[0].employee as any).user).toBeUndefined();
    });
  });

  describe('findByEmployee', () => {
    it('should throw NotFoundException when employee not found', async () => {
      employeeRepository.findOne.mockResolvedValue(null);

      await expect(service.findByEmployee('emp-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return leave requests for an employee', async () => {
      employeeRepository.findOne.mockResolvedValue(employee);
      leaveRepository.find.mockResolvedValue([leave]);

      const result = await service.findByEmployee('emp-1');

      expect(leaveRepository.find).toHaveBeenCalledWith({
        where: { employee: { id: 'emp-1' } },
        relations: ['employee', 'employee.user'],
      });
      expect(result).toEqual([
        {
          ...leave,
          employee: { id: 'emp-1', fullName: 'Jane Doe', profilePicture: null },
        },
      ]);
    });
  });
});
