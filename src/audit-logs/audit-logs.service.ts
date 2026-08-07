import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { AuditLog } from './audit-log.entity';
import { CreateAuditLogDto } from './dto/create-audit-log.dto';
import { AuditLogFilterDto } from './dto/audit-log-filter.dto';

@Injectable()
export class AuditLogsService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  async create(dto: CreateAuditLogDto) {
    const auditLog = this.auditLogRepository.create(dto);
    const saved = await this.auditLogRepository.save(auditLog);

    return {
      success: true,
      message: 'Audit log created successfully',
      data: saved,
    };
  }

  async findAll(filterDto: AuditLogFilterDto = {}) {
    const page = filterDto.page ?? 1;
    const limit = filterDto.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: FindOptionsWhere<AuditLog> = {};

    if (filterDto.action) {
      where.action = filterDto.action;
    }

    if (filterDto.entity) {
      where.entity = filterDto.entity;
    }

    if (filterDto.userId) {
      where.userId = filterDto.userId;
    }

    const queryBuilder = this.auditLogRepository
      .createQueryBuilder('auditLog')
      .leftJoinAndSelect('auditLog.user', 'user')
      .where(where);

    if (filterDto.dateFrom) {
      queryBuilder.andWhere('auditLog.createdAt >= :dateFrom', {
        dateFrom: filterDto.dateFrom,
      });
    }

    if (filterDto.dateTo) {
      queryBuilder.andWhere('auditLog.createdAt <= :dateTo', {
        dateTo: filterDto.dateTo,
      });
    }

    const [data, total] = await queryBuilder
      .orderBy('auditLog.createdAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      success: true,
      message: 'Audit logs retrieved successfully',
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const auditLog = await this.auditLogRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!auditLog) {
      throw new NotFoundException('Audit log not found');
    }

    return {
      success: true,
      message: 'Audit log retrieved successfully',
      data: auditLog,
    };
  }

  async findByUser(userId: string, filterDto: AuditLogFilterDto = {}) {
    const result = await this.findAll({ ...filterDto, userId });
    return result;
  }

  async findByEntity(entity: string, filterDto: AuditLogFilterDto = {}) {
    const result = await this.findAll({ ...filterDto, entity });
    return result;
  }
}
