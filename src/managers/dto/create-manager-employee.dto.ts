import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNumberString,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MinLength,
} from 'class-validator';
import { toIdString } from '@/common/transforms/id-string.transform';

/**
 * Manager-created employees are always regular Employees. The role and the
 * department are assigned server-side (the authenticated manager's department),
 * so those fields are intentionally absent from this DTO.
 */
export class CreateManagerEmployeeDto {
  @ApiProperty({ description: 'Employee full name' })
  @IsString()
  @MinLength(2)
  fullName!: string;

  @ApiProperty({
    description:
      'Employee email. When a userId is provided this must match the linked user account email.',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({ description: 'Employee phone number' })
  @IsPhoneNumber('EG', { message: 'Invalid phone number' })
  phone!: string;

  @ApiProperty({ description: 'Employee position' })
  @IsString()
  @MinLength(2)
  position!: string;

  @ApiProperty({
    required: false,
    description:
      'Existing user account id to link. The account must have the Employee role and no existing employee profile.',
  })
  @IsOptional()
  @Transform(toIdString)
  @IsNumberString()
  userId?: string;
}
