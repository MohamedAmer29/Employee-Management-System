import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsNumberString,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { toIdString } from '@/common/transforms/id-string.transform';
import { PayrollStatus } from '../enums/payroll-status.enum';

export class PayrollQueryDto {
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

  @ApiProperty({ required: false, description: 'Filter by month (1-12)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @ApiProperty({ required: false, description: 'Filter by year' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  year?: number;

  @ApiProperty({
    required: false,
    description: 'Filter by status',
    enum: PayrollStatus,
  })
  @IsOptional()
  @IsEnum(PayrollStatus)
  status?: PayrollStatus;

  @ApiProperty({ required: false, description: 'Filter by employee id' })
  @IsOptional()
  @Transform(toIdString)
  @IsNumberString()
  employeeId?: string;

  @ApiProperty({ required: false, description: 'Filter by manager id' })
  @IsOptional()
  @Transform(toIdString)
  @IsNumberString()
  managerId?: string;

  @ApiProperty({
    required: false,
    description: 'Search by employee/manager name',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
