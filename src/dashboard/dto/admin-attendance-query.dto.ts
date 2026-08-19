import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { toIdString } from '@/common/transforms/id-string.transform';
import { AttendanceStatus } from '@/common/constants/enums';

export class MonthlyAttendanceQueryDto {
  @ApiProperty({
    required: true,
    description: 'Month (1-12)',
    minimum: 1,
    maximum: 12,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @ApiProperty({
    required: true,
    description: 'Year (e.g. 2026)',
    minimum: 2000,
  })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  year!: number;

  @ApiProperty({ required: false, description: 'Filter by department id' })
  @IsOptional()
  @Transform(toIdString)
  @IsNumberString()
  departmentId?: string;

  @ApiProperty({ required: false, description: 'Filter by employee id' })
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiProperty({
    required: false,
    description: 'Search by employee name or email',
  })
  @IsOptional()
  @IsString()
  search?: string;
}

export class AdminAttendanceQueryDto {
  @ApiProperty({ required: false, description: 'Page number', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ required: false, description: 'Items per page', default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @ApiProperty({ required: false, description: 'Search by employee name' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({
    required: false,
    enum: AttendanceStatus,
    description: 'Filter by attendance status',
  })
  @IsOptional()
  @IsEnum(AttendanceStatus)
  status?: AttendanceStatus;

  @ApiProperty({ required: false, description: 'Start date (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({ required: false, description: 'End date (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiProperty({ required: false, description: 'Filter by department id' })
  @IsOptional()
  @Transform(toIdString)
  @IsNumberString()
  departmentId?: string;

  @ApiProperty({ required: false, description: 'Filter by employee id' })
  @IsOptional()
  @IsString()
  employeeId?: string;
}
