import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsNumberString,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { toIdString } from '@/common/transforms/id-string.transform';

export enum AdminListStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export class AdminQueryDto {
  @ApiProperty({ required: false, description: 'Page number', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ required: false, description: 'Items per page', default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @ApiProperty({
    required: false,
    description: 'Search by username/email or employee full name',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({
    required: false,
    enum: AdminListStatus,
    description: 'Filter by active status',
  })
  @IsOptional()
  @IsEnum(AdminListStatus)
  status?: AdminListStatus;

  @ApiProperty({
    required: false,
    description: 'Filter by department id (managers only)',
  })
  @IsOptional()
  @Transform(toIdString)
  @IsNumberString()
  departmentId?: string;
}
