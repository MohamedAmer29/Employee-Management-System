import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { Employee } from '../employees/entities/employee.entity';
import { Attendance } from '../attendance/entities/attendance.entity';
import { LeaveRequest } from '../leave/entities/leave.entity';
import { PerformanceReview } from '../performance/entities/performance';
import { Notification } from '../notifications/notification.entity';
import { AuditLog } from '../audit-logs/audit-log.entity';
import { Department } from '../department/entities/department.entity';
import { User } from '../users/entities/user.entity';
import { DashboardPeriod } from './enums/dashboard-period.enum';

type MockRepository = Record<string, jest.Mock>;
type MockQueryBuilder = ReturnType<typeof createQueryBuilderMock>;

describe('DashboardService', () => {
  let service: DashboardService;
  let repositories: Record<string, MockRepository>;
  let queryBuilders: Record<string, MockQueryBuilder>;

  const createQueryBuilderMock = () => ({
    select: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    clone: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue([]),
    getRawOne: jest.fn().mockResolvedValue({ avg: null }),
    getCount: jest.fn().mockResolvedValue(0),
    getOne: jest.fn().mockResolvedValue(null),
  });

  beforeEach(async () => {
    repositories = {
      Employee: {
        count: jest.fn(),
        findOne: jest.fn(),
        createQueryBuilder: jest.fn(),
      },
      Attendance: {
        count: jest.fn(),
        findOne: jest.fn(),
        find: jest.fn(),
        createQueryBuilder: jest.fn(),
      },
      LeaveRequest: {
        count: jest.fn(),
        createQueryBuilder: jest.fn(),
      },
      PerformanceReview: {
        count: jest.fn(),
        createQueryBuilder: jest.fn(),
      },
      Notification: {
        count: jest.fn(),
        find: jest.fn(),
      },
      AuditLog: {
        createQueryBuilder: jest.fn(),
      },
      Department: {
        count: jest.fn(),
      },
      User: {
        count: jest.fn(),
        findOne: jest.fn(),
      },
    };

    queryBuilders = {};
    for (const key of Object.keys(repositories)) {
      if (repositories[key].createQueryBuilder) {
        queryBuilders[key] = createQueryBuilderMock();
        repositories[key].createQueryBuilder.mockReturnValue(
          queryBuilders[key],
        );
      }
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        {
          provide: getRepositoryToken(Employee),
          useValue: repositories.Employee,
        },
        {
          provide: getRepositoryToken(Attendance),
          useValue: repositories.Attendance,
        },
        {
          provide: getRepositoryToken(LeaveRequest),
          useValue: repositories.LeaveRequest,
        },
        {
          provide: getRepositoryToken(PerformanceReview),
          useValue: repositories.PerformanceReview,
        },
        {
          provide: getRepositoryToken(Notification),
          useValue: repositories.Notification,
        },
        {
          provide: getRepositoryToken(AuditLog),
          useValue: repositories.AuditLog,
        },
        {
          provide: getRepositoryToken(Department),
          useValue: repositories.Department,
        },
        { provide: getRepositoryToken(User), useValue: repositories.User },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getAdminDashboard', () => {
    it('should return aggregated admin statistics', async () => {
      repositories.Employee.count.mockResolvedValue(10);
      repositories.User.count.mockResolvedValue(10);
      repositories.Attendance.count.mockResolvedValue(5);
      repositories.LeaveRequest.count.mockResolvedValue(3);
      repositories.PerformanceReview.count.mockResolvedValue(2);
      repositories.Notification.count.mockResolvedValue(7);
      repositories.Department.count.mockResolvedValue(4);

      const result = await service.getAdminDashboard();

      expect(result).toEqual(
        expect.objectContaining({
          employees: expect.objectContaining({
            total: 10,
            active: 10,
            inactive: 10,
            newThisMonth: 0,
          }),
          departments: expect.objectContaining({ total: 4 }),
          attendance: expect.objectContaining({
            presentToday: 5,
            absentToday: 5,
            attendanceRate: 50,
          }),
          leave: expect.objectContaining({
            total: 3,
            pending: 3,
            approved: 3,
            rejected: 3,
          }),
          performance: expect.objectContaining({
            totalReviews: 2,
            reviewsThisMonth: 0,
          }),
          notifications: expect.objectContaining({ total: 7, unread: 7 }),
          recentActivities: expect.any(Array),
        }),
      );
    });
  });

  describe('getAdminAttendanceTrend', () => {
    it('should map raw rows into attendance trend data', async () => {
      queryBuilders.Attendance.getRawMany.mockResolvedValue([
        { attendance_date: '2026-08-08', present: '3', absent: '1' },
      ]);

      const result = await service.getAdminAttendanceTrend(
        DashboardPeriod.TODAY,
      );

      expect(queryBuilders.Attendance.andWhere).toHaveBeenCalled();
      expect(result).toEqual({
        attendanceTrend: [{ date: '2026-08-08', present: 3, absent: 1 }],
      });
    });
  });

  describe('getManagerDashboard', () => {
    it('should throw NotFoundException when user has no employee record', async () => {
      repositories.User.findOne.mockResolvedValue({
        id: 'user-1',
        employee: null,
      });

      await expect(service.getManagerDashboard('user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return manager dashboard statistics', async () => {
      repositories.User.findOne.mockResolvedValue({
        id: 'user-1',
        employee: { id: 'emp-1', department: { id: 'dept-1' } },
      });
      repositories.Notification.count.mockResolvedValue(0);

      const result = await service.getManagerDashboard('user-1');

      expect(repositories.User.findOne).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        relations: ['employee', 'employee.department'],
      });
      expect(result).toEqual(
        expect.objectContaining({
          employees: expect.objectContaining({ total: 0, active: 0 }),
          attendance: expect.objectContaining({ attendanceRate: 0 }),
          leave: expect.objectContaining({
            pending: 0,
            approved: 0,
            rejected: 0,
          }),
          performance: expect.objectContaining({ totalReviews: 0 }),
          unreadNotifications: 0,
          recentActivities: expect.any(Array),
        }),
      );
    });
  });

  describe('getEmployeeDashboard', () => {
    it('should throw NotFoundException when user has no employee record', async () => {
      repositories.User.findOne.mockResolvedValue({
        id: 'user-1',
        employee: null,
      });

      await expect(service.getEmployeeDashboard('user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return employee dashboard statistics', async () => {
      repositories.User.findOne.mockResolvedValue({
        id: 'user-1',
        employee: {
          id: 'emp-1',
          fullName: 'Jane Doe',
          position: 'Developer',
          department: { name: 'Engineering' },
        },
      });
      repositories.Attendance.findOne.mockResolvedValue({
        checkIn: '09:00:00',
        checkOut: '17:00:00',
        isPresent: true,
      });
      repositories.LeaveRequest.count.mockResolvedValue(1);
      repositories.PerformanceReview.count.mockResolvedValue(1);
      queryBuilders.PerformanceReview.getRawOne.mockResolvedValue({
        avg: '4.5',
      });
      repositories.Notification.count.mockResolvedValue(2);
      repositories.Notification.find.mockResolvedValue([]);

      const result = await service.getEmployeeDashboard('user-1');

      expect(result).toEqual(
        expect.objectContaining({
          employee: expect.objectContaining({
            name: 'Jane Doe',
            position: 'Developer',
            department: 'Engineering',
          }),
          attendance: expect.objectContaining({
            today: expect.objectContaining({ status: 'present' }),
            monthlyRate: 0,
          }),
          leave: expect.objectContaining({
            pending: 1,
            approved: 1,
            rejected: 1,
          }),
          performance: expect.objectContaining({
            averageRating: 4.5,
            totalReviews: 1,
            latestReview: null,
          }),
          notifications: expect.objectContaining({ unread: 2, latest: [] }),
        }),
      );
    });
  });
});
