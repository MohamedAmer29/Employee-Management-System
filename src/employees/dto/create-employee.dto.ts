import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNumberString,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MinLength,
} from 'class-validator';
import { Role } from '../../auth/interfaces/Role.enum';
import { toIdString } from '../../common/transforms/id-string.transform';

export class CreateEmployeeDto {
  @ApiProperty({ description: 'Employee full name' })
  @IsString()
  @MinLength(2)
  fullName!: string;

  @ApiProperty({ description: 'Employee email' })
  @IsEmail()
  email!: string;

  @ApiProperty({ description: 'Employee phone number' })
  @IsPhoneNumber('EG', { message: 'Invalid phone number' })
  phone!: string;

  @ApiProperty({ description: 'Employee position' })
  @IsString()
  @MinLength(2)
  position!: string;

  @ApiProperty({ enum: Role, description: 'Employee role' })
  @IsEnum(Role)
  role!: Role;

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

  @ApiProperty({
    required: false,
    default: true,
    description: 'Employee active status',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
