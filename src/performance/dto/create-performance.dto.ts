import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  Max,
} from 'class-validator';

export class CreatePerformanceDto {
  @ApiProperty({ description: 'Employee id being reviewed' })
  @IsUUID()
  employeeId!: string;

  @ApiProperty({ description: 'Performance feedback' })
  @IsString()
  @IsNotEmpty()
  feedback!: string;

  @ApiProperty({ description: 'Performance rating', minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiProperty({
    description: 'Review date',
    type: 'string',
    format: 'date',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  reviewDate?: string;
}
