import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNumberString,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { toIdString } from '@/common/transforms/id-string.transform';

export class UpdateManagerDto {
  @ApiProperty({ required: false, description: 'First name' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  firstName?: string;

  @ApiProperty({ required: false, description: 'Last name' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  lastName?: string;

  @ApiProperty({ required: false, description: 'Country' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiProperty({ required: false, description: 'City' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiProperty({ required: false, description: 'Phone number' })
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiProperty({ required: false, description: 'National ID' })
  @IsOptional()
  @IsString()
  nationalId?: string;

  @ApiProperty({ required: false, description: 'Job title' })
  @IsOptional()
  @IsString()
  position?: string;

  @ApiProperty({
    required: false,
    description: 'Reassign the manager to a different department',
  })
  @IsOptional()
  @Transform(toIdString)
  @IsNumberString()
  departmentId?: string;
}
