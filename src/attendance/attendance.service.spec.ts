import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { Attendance } from './entities/attendance.entity';
import { UsersService } from '../users/users.service';
import { EmployeesService } from '../employees/employees.service';

describe('AttendanceService', () => {
  let service: AttendanceService;
  let attendanceRepository: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
  };
  let usersService: { findOne: jest.Mock };
  let employeesService: { findOne: jest.Mock };
  let eventEmitter: { emit: jest.Mock };

  const employee = { id: 'emp-1', fullName: 'Jane Doe' };
  const today = new Date().toISOString().split('T')[0];

  beforeEach(async () => {
    attendanceRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
    };
    usersService = { findOne: jest.fn() };
    employeesService = { findOne: jest.fn() };
    eventEmitter = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceService,
        {
          provide: getRepositoryToken(Attendance),
          useValue: attendanceRepository,
        },
        { provide: UsersService, useValue: usersService },
        { provide: EmployeesService, useValue: employeesService },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<AttendanceService>(AttendanceService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkIn', () => {
    it('should create a new attendance record when none exists', async () => {
      usersService.findOne.mockResolvedValue({ id: 'user-1', employee });
      attendanceRepository.findOne.mockResolvedValue(null);
      attendanceRepository.create.mockReturnValue({ id: 'att-1', employee });
      attendanceRepository.save.mockResolvedValue({
        id: 'att-1',
        employee,
        date: today,
        checkIn: '09:00:00',
        isPresent: true,
      });

      const result = await service.checkIn('user-1');

      expect(usersService.findOne).toHaveBeenCalledWith('user-1');
      expect(attendanceRepository.findOne).toHaveBeenCalledWith({
        where: { employee: { id: 'emp-1' }, date: today },
      });
      expect(attendanceRepository.create).toHaveBeenCalled();
      expect(attendanceRepository.save).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'audit.log.created',
        expect.objectContaining({ entity: 'Attendance' }),
      );
      expect(result.isPresent).toBe(true);
    });

    it('should throw ConflictException when already checked in', async () => {
      usersService.findOne.mockResolvedValue({ id: 'user-1', employee });
      attendanceRepository.findOne.mockResolvedValue({
        id: 'att-1',
        checkIn: '09:00:00',
      });

      await expect(service.checkIn('user-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('should update an existing record that has no check-in', async () => {
      usersService.findOne.mockResolvedValue({ id: 'user-1', employee });
      const existing = { id: 'att-1', checkIn: null, isPresent: false };
      attendanceRepository.findOne.mockResolvedValue(existing);
      attendanceRepository.save.mockResolvedValue({
        ...existing,
        checkIn: '09:30:00',
        isPresent: true,
      });

      const result = await service.checkIn('user-1');

      expect(attendanceRepository.save).toHaveBeenCalled();
      expect(result.isPresent).toBe(true);
    });

    it('should throw NotFoundException when user has no employee record', async () => {
      usersService.findOne.mockResolvedValue({ id: 'user-1', employee: null });

      await expect(service.checkIn('user-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('checkOut', () => {
    it('should throw BadRequestException when no attendance exists', async () => {
      usersService.findOne.mockResolvedValue({ id: 'user-1', employee });
      attendanceRepository.findOne.mockResolvedValue(null);

      await expect(service.checkOut('user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when check-in is missing', async () => {
      usersService.findOne.mockResolvedValue({ id: 'user-1', employee });
      attendanceRepository.findOne.mockResolvedValue({
        id: 'att-1',
        checkIn: null,
      });

      await expect(service.checkOut('user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw ConflictException when already checked out', async () => {
      usersService.findOne.mockResolvedValue({ id: 'user-1', employee });
      attendanceRepository.findOne.mockResolvedValue({
        id: 'att-1',
        checkIn: '09:00:00',
        checkOut: '17:00:00',
      });

      await expect(service.checkOut('user-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('should check out successfully and compute worked hours', async () => {
      usersService.findOne.mockResolvedValue({ id: 'user-1', employee });
      attendanceRepository.findOne.mockResolvedValue({
        id: 'att-1',
        checkIn: '09:00:00',
        checkOut: null,
      });
      attendanceRepository.save.mockResolvedValue({
        id: 'att-1',
        checkIn: '09:00:00',
        checkOut: '17:00:00',
      });

      const result = await service.checkOut('user-1');

      expect(attendanceRepository.save).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'audit.log.created',
        expect.objectContaining({ entity: 'Attendance' }),
      );
      expect(result.workedHours).toBeDefined();
    });
  });

  describe('findAll / findByEmployee', () => {
    it('should return all attendance records', async () => {
      attendanceRepository.find.mockResolvedValue([{ id: 'att-1', employee }]);

      const result = await service.findAll();

      expect(attendanceRepository.find).toHaveBeenCalledWith({
        where: {},
        relations: ['employee', 'employee.user'],
      });
      expect(result).toEqual([
        {
          id: 'att-1',
          employee: {
            id: 'emp-1',
            fullName: 'Jane Doe',
            profilePicture: null,
          },
        },
      ]);
    });

    it('should return attendance records for an employee', async () => {
      employeesService.findOne.mockResolvedValue(employee);
      attendanceRepository.find.mockResolvedValue([{ id: 'att-1', employee }]);

      const result = await service.findByEmployee('emp-1');

      expect(employeesService.findOne).toHaveBeenCalledWith('emp-1');
      expect(attendanceRepository.find).toHaveBeenCalledWith({
        where: { employee: { id: 'emp-1' } },
        relations: ['employee', 'employee.user'],
      });
      expect(result).toEqual([
        {
          id: 'att-1',
          employee: {
            id: 'emp-1',
            fullName: 'Jane Doe',
            profilePicture: null,
          },
        },
      ]);
    });

    it('should lift the employee profile picture and strip the user relation', async () => {
      attendanceRepository.find.mockResolvedValue([
        {
          id: 'att-1',
          employee: {
            id: 'emp-1',
            fullName: 'Jane Doe',
            user: {
              id: 'u-1',
              password: 'secret',
              profilePicture: 'https://img.example/pic.jpg',
            },
          },
        },
      ]);

      const result = await service.findAll();

      expect(result[0].employee).toEqual({
        id: 'emp-1',
        fullName: 'Jane Doe',
        profilePicture: 'https://img.example/pic.jpg',
      });
      expect(result[0].employee).not.toHaveProperty('user');
    });

    it('should propagate NotFoundException when employee not found', async () => {
      employeesService.findOne.mockImplementation(() => {
        throw new NotFoundException('Employee not found');
      });

      await expect(service.findByEmployee('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
