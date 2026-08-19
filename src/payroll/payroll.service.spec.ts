import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException } from '@nestjs/common';
import { PayrollService } from './payroll.service';
import { Compensation } from './entities/compensation.entity';
import { SalaryDeduction } from './entities/salary-deduction.entity';
import { SalaryBonus } from './entities/salary-bonus.entity';
import { SalaryHistory } from './entities/salary-history.entity';
import { Employee } from '../employees/entities/employee.entity';
import { User } from '../users/entities/user.entity';
import { Attendance } from '../attendance/entities/attendance.entity';
import { LeaveRequest } from '../leave/entities/leave.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getBusinessDate } from '../common/utils/timezones.util';

describe('PayrollService', () => {
  let service: PayrollService;
  let compensationRepository: { findOne: jest.Mock };
  let userRepository: { findOne: jest.Mock };
  let notificationsService: { sendToUser: jest.Mock };
  let eventEmitter: { emit: jest.Mock };

  const makeRepo = () => ({
    findOne: jest.fn(),
    find: jest.fn(),
    findAndCount: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  });

  beforeEach(async () => {
    compensationRepository = { findOne: jest.fn() };
    userRepository = { findOne: jest.fn() };
    notificationsService = { sendToUser: jest.fn() };
    eventEmitter = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayrollService,
        {
          provide: getRepositoryToken(Compensation),
          useValue: compensationRepository,
        },
        { provide: getRepositoryToken(SalaryDeduction), useValue: makeRepo() },
        { provide: getRepositoryToken(SalaryBonus), useValue: makeRepo() },
        { provide: getRepositoryToken(SalaryHistory), useValue: makeRepo() },
        { provide: getRepositoryToken(Employee), useValue: makeRepo() },
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: getRepositoryToken(Attendance), useValue: makeRepo() },
        { provide: getRepositoryToken(LeaveRequest), useValue: makeRepo() },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<PayrollService>(PayrollService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getEmployeeCurrentPayroll', () => {
    const employeeUserId = 'user-1';
    const employee = { id: 'emp-1' };

    it('throws ForbiddenException when the user does not exist', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getEmployeeCurrentPayroll(employeeUserId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when the user has no linked employee', async () => {
      userRepository.findOne.mockResolvedValue({ id: employeeUserId });

      await expect(
        service.getEmployeeCurrentPayroll(employeeUserId),
      ).rejects.toThrow(ForbiddenException);
      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { id: employeeUserId },
        relations: ['employee'],
      });
    });

    it('returns { exists: false, year, month } when no payroll record exists for the current month', async () => {
      userRepository.findOne.mockResolvedValue({ id: employeeUserId, employee });
      compensationRepository.findOne.mockResolvedValue(null);
      const [year, month] = getBusinessDate().split('-').map(Number);

      const result = await service.getEmployeeCurrentPayroll(employeeUserId);

      expect(compensationRepository.findOne).toHaveBeenCalledWith({
        where: { employee: { id: 'emp-1' }, month, year },
        relations: [
          'employee',
          'employee.user',
          'employee.department',
          'manager',
          'deductions',
          'bonuses',
          'createdBy',
        ],
      });
      // The endpoint must return valid JSON (never `null`, which Nest would
      // serialise as an empty body and break JSON clients).
      expect(result).toEqual({ exists: false, year, month });
    });

    it('returns the mapped payroll object when a record exists', async () => {
      const compensation = { id: 'c-1', netSalary: 100 } as any;
      userRepository.findOne.mockResolvedValue({ id: employeeUserId, employee });
      compensationRepository.findOne.mockResolvedValue(compensation);
      const toResponseSpy = jest
        .spyOn(service as any, 'toResponse')
        .mockReturnValue({ id: 'c-1', netSalary: 100 });

      const result = await service.getEmployeeCurrentPayroll(employeeUserId);

      expect(toResponseSpy).toHaveBeenCalledWith(compensation);
      expect(result).toEqual({ id: 'c-1', netSalary: 100 });
    });
  });
});
