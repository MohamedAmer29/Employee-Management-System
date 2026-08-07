import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogsService } from './audit-logs.service';
import { AuditLog } from './audit-log.entity';
import { AuditAction } from './enums/audit-action.enum';
import { NotFoundException } from '@nestjs/common';

describe('AuditLogsService', () => {
  let service: AuditLogsService;
  let repository: jest.Mocked<Repository<AuditLog>>;

  const mockAuditLog: AuditLog = {
    id: '1',
    userId: 'user-1',
    action: AuditAction.LOGIN,
    entity: 'User',
    entityId: 'user-1',
    description: 'User logged in',
    oldValues: undefined,
    newValues: undefined,
    ipAddress: '127.0.0.1',
    userAgent: 'Mozilla/5.0',
    createdAt: new Date(),
    user: undefined,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogsService,
        {
          provide: getRepositoryToken(AuditLog),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
            findAndCount: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuditLogsService>(AuditLogsService);
    repository = module.get(getRepositoryToken(AuditLog));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create an audit log successfully', async () => {
      const createDto = {
        userId: 'user-1',
        action: AuditAction.LOGIN,
        entity: 'User',
        entityId: 'user-1',
        description: 'User logged in',
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0',
      };

      repository.create.mockReturnValue(mockAuditLog);
      repository.save.mockResolvedValue(mockAuditLog);

      const result = await service.create(createDto);

      expect(repository.create).toHaveBeenCalledWith(createDto);
      expect(repository.save).toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        message: 'Audit log created successfully',
        data: mockAuditLog,
      });
    });
  });

  describe('findAll', () => {
    it('should return paginated audit logs', async () => {
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mockAuditLog], 1]),
      };

      repository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result).toEqual({
        success: true,
        message: 'Audit logs retrieved successfully',
        data: [mockAuditLog],
        meta: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
        },
      });
    });

    it('should filter by action', async () => {
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mockAuditLog], 1]),
      };

      repository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      await service.findAll({ action: AuditAction.LOGIN });

      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        expect.objectContaining({ action: AuditAction.LOGIN }),
      );
    });

    it('should filter by date range', async () => {
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mockAuditLog], 1]),
      };

      repository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      await service.findAll({
        dateFrom: '2024-01-01',
        dateTo: '2024-12-31',
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'auditLog.createdAt >= :dateFrom',
        { dateFrom: '2024-01-01' },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'auditLog.createdAt <= :dateTo',
        { dateTo: '2024-12-31' },
      );
    });
  });

  describe('findOne', () => {
    it('should return a single audit log', async () => {
      repository.findOne.mockResolvedValue(mockAuditLog);

      const result = await service.findOne('1');

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: '1' },
        relations: ['user'],
      });
      expect(result).toEqual({
        success: true,
        message: 'Audit log retrieved successfully',
        data: mockAuditLog,
      });
    });

    it('should throw NotFoundException if audit log not found', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findByUser', () => {
    it('should return audit logs for a specific user', async () => {
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mockAuditLog], 1]),
      };

      repository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      const result = await service.findByUser('user-1');

      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1' }),
      );
      expect(result.success).toBe(true);
    });
  });

  describe('findByEntity', () => {
    it('should return audit logs for a specific entity', async () => {
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mockAuditLog], 1]),
      };

      repository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      const result = await service.findByEntity('Employee');

      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'Employee' }),
      );
      expect(result.success).toBe(true);
    });
  });
});
