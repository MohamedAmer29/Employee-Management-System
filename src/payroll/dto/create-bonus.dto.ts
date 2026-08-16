import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';
import { BonusType } from '../enums/bonus-type.enum';

export class CreateBonusDto {
  @ApiProperty({ description: 'Bonus amount', minimum: 0 })
  @IsNumber()
  @Min(0)
  amount!: number;

  @ApiProperty({ description: 'Bonus type', enum: BonusType })
  @IsEnum(BonusType)
  type!: BonusType;

  @ApiProperty({ description: 'Reason for the bonus' })
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
