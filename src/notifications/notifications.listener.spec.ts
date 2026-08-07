import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationsListener } from './notifications.listener';
import { NotificationsService } from './notifications.service';
import { User } from '@/users/entities/user.entity';
import { Employee } from '@/employees/entities/employee.entity';
import { Role } from '@/auth/interfaces/Role.enum';
import { NotificationType } from './enums/notification-type.enum';
import { LeaveCreatedEvent } from '@/common/events/leave-created.event';
import { LeaveApprovedEvent } from '@/common/events/leave-approved.event';
import { LeaveRejectedEvent } from '@/common/events/leave-rejected.event';
import { PerformanceReviewCreatedEvent } from '@/common/events/performance-review-created.event';
import { EmployeeUpdatedEvent } from '@/common/events/employee-updated.event';

describe('NotificationsListener', () => {
  let listener: NotificationsListener;
  let notificationsService: jest.Mocked<NotificationsService>;
  let userRepository: jest.Mocked<Repository<User>>;

  const mockEmployee: Employee = {
    id: 'employee-1',
    fullName: 'John Doe',
    email: 'john@example.com',
    phone: '1234567890',
    position: 'Developer',
    isActive: true,
    role: Role.employee,
    department: undefined,
    profilePicture: undefined,
  } as any;

  const mockManager: User = {
    id: 'manager-1',
    firstName: 'John',
    lastName: 'Doe',
    country: 'USA',
    city: 'New York',
    phoneNumber: '1234567890',
    nationalId: '12345',
    username: 'manager',
    password: 'hashed',
    role: Role.manager,
    tokenVersion: 1,
    isActive: true,
    employee: mockEmployee,
    auditLogs: [],
    notifications: [],
  };

  const mockAdmin: User = {
    id: 'admin-1',
    firstName: 'Admin',
    lastName: 'User',
    country: 'USA',
    city: 'New York',
    phoneNumber: '0987654321',
    nationalId: '54321',
    username: 'admin',
    password: 'hashed',
    role: Role.admin,
    tokenVersion: 1,
    isActive: true,
    employee: mockEmployee,
    auditLogs: [],
    notifications: [],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsListener,
        {
          provide: NotificationsService,
          useValue: {
            create: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            find: jest.fn(),
          },
        },
      ],
    }).compile();

    listener = module.get<NotificationsListener>(NotificationsListener);
    notificationsService = module.get(NotificationsService);
    userRepository = module.get(getRepositoryToken(User));
  });

  it('should be defined', () => {
    expect(listener).toBeDefined();
  });

  describe('handleNotificationCreated', () => {
    it('should create a notification when notification.created event is emitted', async () => {
      const payload = {
        userId: 'user-1',
        type: NotificationType.SYSTEM,
        title: 'System notification',
        message: 'System message',
      };

      await listener.handleNotificationCreated(payload);

      expect(notificationsService.create).toHaveBeenCalledWith({
        userId: 'user-1',
        type: NotificationType.SYSTEM,
        title: 'System notification',
        message: 'System message',
      });
    });
  });

  describe('handleLeaveCreated', () => {
    it('should notify managers and admins when leave is created', async () => {
      userRepository.find.mockResolvedValue([mockManager, mockAdmin]);

      const event = new LeaveCreatedEvent('user-1', 'employee-1', 'Jane Doe');

      await listener.handleLeaveCreated(event);

      expect(userRepository.find).toHaveBeenCalledWith({
        where: [{ role: Role.manager }, { role: Role.admin }],
      });
      expect(notificationsService.create).toHaveBeenCalledTimes(2);
      expect(notificationsService.create).toHaveBeenCalledWith({
        userId: mockManager.id,
        type: NotificationType.LEAVE_REQUEST,
        title: 'New leave request',
        message: 'Jane Doe submitted a new leave request.',
      });
      expect(notificationsService.create).toHaveBeenCalledWith({
        userId: mockAdmin.id,
        type: NotificationType.LEAVE_REQUEST,
        title: 'New leave request',
        message: 'Jane Doe submitted a new leave request.',
      });
    });

    it('should handle case when no managers or admins exist', async () => {
      userRepository.find.mockResolvedValue([]);

      const event = new LeaveCreatedEvent('user-1', 'employee-1', 'Jane Doe');

      await listener.handleLeaveCreated(event);

      expect(notificationsService.create).not.toHaveBeenCalled();
    });
  });

  describe('handleLeaveApproved', () => {
    it('should notify employee when leave is approved', async () => {
      const event = new LeaveApprovedEvent('user-1', 'Jane Doe');

      await listener.handleLeaveApproved(event);

      expect(notificationsService.create).toHaveBeenCalledWith({
        userId: 'user-1',
        type: NotificationType.LEAVE_APPROVED,
        title: 'Leave request approved',
        message: 'Your leave request has been approved.',
      });
    });
  });

  describe('handleLeaveRejected', () => {
    it('should notify employee when leave is rejected without reason', async () => {
      const event = new LeaveRejectedEvent('user-1', 'Jane Doe');

      await listener.handleLeaveRejected(event);

      expect(notificationsService.create).toHaveBeenCalledWith({
        userId: 'user-1',
        type: NotificationType.LEAVE_REJECTED,
        title: 'Leave request rejected',
        message: 'Your leave request has been rejected.',
      });
    });

    it('should notify employee when leave is rejected with reason', async () => {
      const event = new LeaveRejectedEvent(
        'user-1',
        'Jane Doe',
        'Insufficient leave balance',
      );

      await listener.handleLeaveRejected(event);

      expect(notificationsService.create).toHaveBeenCalledWith({
        userId: 'user-1',
        type: NotificationType.LEAVE_REJECTED,
        title: 'Leave request rejected',
        message:
          'Your leave request has been rejected: Insufficient leave balance',
      });
    });
  });

  describe('handlePerformanceCreated', () => {
    it('should notify employee when performance review is created', async () => {
      const event = new PerformanceReviewCreatedEvent('user-1', 'Jane Doe');

      await listener.handlePerformanceCreated(event);

      expect(notificationsService.create).toHaveBeenCalledWith({
        userId: 'user-1',
        type: NotificationType.PERFORMANCE_REVIEW,
        title: 'New performance review',
        message: 'A new performance review is available.',
      });
    });
  });

  describe('handleEmployeeUpdated', () => {
    it('should notify employee when their information is updated', async () => {
      const event = new EmployeeUpdatedEvent('user-1', 'Jane Doe');

      await listener.handleEmployeeUpdated(event);

      expect(notificationsService.create).toHaveBeenCalledWith({
        userId: 'user-1',
        type: NotificationType.EMPLOYEE_UPDATE,
        title: 'Employee information updated',
        message: 'Your employee information has been updated.',
      });
    });
  });
});
