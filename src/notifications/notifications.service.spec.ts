import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationsService } from './notifications.service';
import { Notification } from './notification.entity';
import { NotificationType } from './enums/notification-type.enum';
import { NotFoundException } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let repository: jest.Mocked<Repository<Notification>>;

  const mockNotification: Notification = {
    id: '1',
    userId: 'user-1',
    type: NotificationType.LEAVE_REQUEST,
    title: 'New leave request',
    message: 'A new leave request has been submitted.',
    isRead: false,
    readAt: undefined,
    createdAt: new Date(),
    user: undefined,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: getRepositoryToken(Notification),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
            findAndCount: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn().mockResolvedValue(null),
            getJson: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue(true),
            setJson: jest.fn().mockResolvedValue(true),
            exists: jest.fn().mockResolvedValue(false),
            increment: jest.fn().mockResolvedValue(1),
            decrement: jest.fn().mockResolvedValue(0),
            delete: jest.fn().mockResolvedValue(1),
          },
        },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    repository = module.get(getRepositoryToken(Notification));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a notification successfully', async () => {
      const createDto = {
        userId: 'user-1',
        type: NotificationType.LEAVE_REQUEST,
        title: 'New leave request',
        message: 'A new leave request has been submitted.',
      };

      repository.create.mockReturnValue(mockNotification);
      repository.save.mockResolvedValue(mockNotification);

      const result = await service.create(createDto);

      expect(repository.create).toHaveBeenCalledWith(createDto);
      expect(repository.save).toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        message: 'Notification created successfully',
        data: mockNotification,
      });
    });
  });

  describe('findAllForUser', () => {
    it('should return paginated notifications for a user', async () => {
      repository.findAndCount.mockResolvedValue([[mockNotification], 1]);

      const result = await service.findAllForUser('user-1', 1, 20);

      expect(repository.findAndCount).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        order: { createdAt: 'DESC' },
        skip: 0,
        take: 20,
      });
      expect(result).toEqual({
        success: true,
        message: 'Notifications retrieved successfully',
        data: [mockNotification],
        meta: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
        },
      });
    });
  });

  describe('findUnread', () => {
    it('should return unread notifications for a user', async () => {
      repository.findAndCount.mockResolvedValue([[mockNotification], 1]);

      const result = await service.findUnread('user-1', 1, 20);

      expect(repository.findAndCount).toHaveBeenCalledWith({
        where: { userId: 'user-1', isRead: false },
        order: { createdAt: 'DESC' },
        skip: 0,
        take: 20,
      });
      expect(result).toEqual({
        success: true,
        message: 'Unread notifications retrieved successfully',
        data: [mockNotification],
        meta: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
        },
      });
    });
  });

  describe('markAsRead', () => {
    it('should mark a notification as read', async () => {
      repository.findOne.mockResolvedValue(mockNotification);
      repository.save.mockResolvedValue({
        ...mockNotification,
        isRead: true,
        readAt: new Date(),
      });

      const result = await service.markAsRead('1', 'user-1');

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: '1', userId: 'user-1' },
      });
      expect(repository.save).toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        message: 'Notification marked as read',
        data: expect.objectContaining({
          isRead: true,
          readAt: expect.any(Date),
        }),
      });
    });

    it('should throw NotFoundException if notification not found', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(
        service.markAsRead('non-existent', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if notification belongs to different user', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.markAsRead('1', 'different-user')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all notifications as read for a user', async () => {
      repository.update.mockResolvedValue({
        affected: 5,
        raw: [],
        generatedMaps: [],
      });

      const result = await service.markAllAsRead('user-1');

      expect(repository.update).toHaveBeenCalledWith(
        { userId: 'user-1', isRead: false },
        { isRead: true, readAt: expect.any(Date) },
      );
      expect(result).toEqual({
        success: true,
        message: 'All notifications marked as read',
        data: [],
      });
    });
  });

  describe('delete', () => {
    it('should delete a notification', async () => {
      repository.delete.mockResolvedValue({ affected: 1, raw: [] });

      const result = await service.delete('1', 'user-1');

      expect(repository.delete).toHaveBeenCalledWith({
        id: '1',
        userId: 'user-1',
      });
      expect(result).toEqual({
        success: true,
        message: 'Notification deleted successfully',
        data: [],
      });
    });

    it('should throw NotFoundException if notification not found', async () => {
      repository.delete.mockResolvedValue({ affected: 0, raw: [] });

      await expect(service.delete('non-existent', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
