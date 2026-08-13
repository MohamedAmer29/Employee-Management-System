import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNumberString,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { toIdString } from '../../common/transforms/id-string.transform';

/**
 * Update payload for an employee. Identity/contact fields (fullName, email,
 * phone, role) and status (isActive) are intentionally excluded because they
 * are derived from the linked User account and kept in sync via the entity
 * hooks and UserSubscriber.
 */
export class UpdateEmployeeDto {
  @ApiProperty({ required: false, description: 'Employee position' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  position?: string;

  @ApiProperty({ required: false, description: 'Department id to assign' })
  @IsOptional()
  @Transform(toIdString)
  @IsNumberString()
  departmentId?: string;

  @ApiProperty({ required: false, description: 'User account id to assign' })
  @IsOptional()
  @Transform(toIdString)
  @IsNumberString()
  userId?: string;
}
