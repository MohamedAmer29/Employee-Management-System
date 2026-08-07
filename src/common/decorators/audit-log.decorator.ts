import { SetMetadata } from '@nestjs/common';
import { AuditAction } from '@/audit-logs/enums/audit-action.enum';

export interface AuditLogOptions {
  action: AuditAction;
  entity?: string;
  description?: string;
}

export const AUDIT_LOG_KEY = 'audit_log';

export const AuditLog = (options: AuditLogOptions) =>
  SetMetadata(AUDIT_LOG_KEY, options);
