import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsNumberString,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { toIdString } from '@/common/transforms/id-string.transform';

export class CalculatePayrollDto {
  @ApiProperty({
    description: 'Payroll month (1-12)',
    minimum: 1,
    maximum: 12,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @ApiProperty({ description: 'Payroll year', example: 2026 })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;

  @ApiProperty({ description: 'Base salary for the period', minimum: 0 })
  @IsNumber()
  @Min(0)
  baseSalary!: number;

  @ApiProperty({
    description: 'Expected working days in the payroll period',
    minimum: 0,
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  workingDays!: number;
}
