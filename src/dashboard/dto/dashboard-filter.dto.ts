import { Type, Transform } from 'class-transformer';
import { IsEnum, IsNumberString, IsOptional, IsString } from 'class-validator';
import { DashboardPeriod } from '../enums/dashboard-period.enum';
import { toIdString } from '../../common/transforms/id-string.transform';

export class DashboardFilterDto {
  @IsOptional()
  @IsEnum(DashboardPeriod)
  period?: DashboardPeriod;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  @IsOptional()
  @Transform(toIdString)
  @IsNumberString()
  departmentId?: string;
}
