import {
  IsEnum,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { AuditAction } from '../enums/audit-action.enum';
import { toIdString } from '../../common/transforms/id-string.transform';

export class CreateAuditLogDto {
  @IsOptional()
  @Transform(toIdString)
  @IsNumberString()
  userId?: string;

  @IsEnum(AuditAction)
  @IsNotEmpty()
  action!: AuditAction;

  @IsOptional()
  @IsString()
  entity?: string;

  @IsOptional()
  @IsString()
  entityId?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  oldValues?: Record<string, unknown>;

  @IsOptional()
  newValues?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  ipAddress?: string;

  @IsOptional()
  @IsString()
  userAgent?: string;
}
