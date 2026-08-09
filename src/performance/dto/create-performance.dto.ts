import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  Min,
  Max,
} from 'class-validator';
import { toIdString } from '../../common/transforms/id-string.transform';

export class CreatePerformanceDto {
  @ApiProperty({ description: 'Employee id being reviewed' })
  @Transform(toIdString)
  @IsNumberString()
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
