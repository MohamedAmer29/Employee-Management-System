import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';
import { DeductionType } from '../enums/deduction-type.enum';

export class CreateDeductionDto {
  @ApiProperty({ description: 'Deduction amount', minimum: 0 })
  @IsNumber()
  @Min(0)
  amount!: number;

  @ApiProperty({ description: 'Deduction type', enum: DeductionType })
  @IsEnum(DeductionType)
  type!: DeductionType;

  @ApiProperty({ description: 'Reason for the deduction' })
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
