import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AuditLogsService } from './audit-logs.service';
import { AuditAction } from './enums/audit-action.enum';

@Injectable()
export class AuditLogsListener {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @OnEvent('audit.log.created')
  async handleAuditLogCreated(payload: {
    userId?: string;
    action: AuditAction;
    entity?: string;
    entityId?: string;
    description?: string;
    oldValues?: Record<string, unknown>;
    newValues?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
  }) {
    await this.auditLogsService.create({
      userId: payload.userId,
      action: payload.action,
      entity: payload.entity,
      entityId: payload.entityId,
      description: payload.description,
      oldValues: payload.oldValues,
      newValues: payload.newValues,
      ipAddress: payload.ipAddress,
      userAgent: payload.userAgent,
    });
  }
}
