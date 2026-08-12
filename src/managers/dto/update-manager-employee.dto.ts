import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MinLength,
} from 'class-validator';

/**
 * Managers may edit non-sensitive employee fields only. Role, linked user,
 * password and department reassignment are intentionally excluded.
 */
export class UpdateManagerEmployeeDto {
  @ApiProperty({ required: false, description: 'Employee full name' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  fullName?: string;

  @ApiProperty({ required: false, description: 'Employee email' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ required: false, description: 'Employee phone number' })
  @IsOptional()
  @IsPhoneNumber('EG', { message: 'Invalid phone number' })
  phone?: string;

  @ApiProperty({ required: false, description: 'Employee position' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  position?: string;

  @ApiProperty({
    required: false,
    description: 'Employee active status',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
