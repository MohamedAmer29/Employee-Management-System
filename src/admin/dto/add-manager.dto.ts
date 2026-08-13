import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNumberString,
  IsOptional,
  IsString,
  IsStrongPassword,
  MinLength,
} from 'class-validator';
import { toIdString } from '@/common/transforms/id-string.transform';

export class AddManagerDto {
  @ApiProperty({ description: 'First name' })
  @IsString()
  @MinLength(2)
  firstName!: string;

  @ApiProperty({ description: 'Last name' })
  @IsString()
  @MinLength(2)
  lastName!: string;

  @ApiProperty({
    description:
      'Login email. Also used as the employee email and the employee full name is derived from the first/last name.',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase().trim() : value,
  )
  @IsEmail()
  email!: string;

  @ApiProperty({ description: 'Account password' })
  @IsStrongPassword()
  password!: string;

  @ApiProperty({ description: 'Country' })
  @IsString()
  country!: string;

  @ApiProperty({ description: 'City' })
  @IsString()
  city!: string;

  @ApiProperty({ description: 'Phone number' })
  @IsString()
  phoneNumber!: string;

  @ApiProperty({ description: 'National ID' })
  @IsString()
  nationalId!: string;

  @ApiProperty({
    required: false,
    description: 'Job title. Defaults to "Manager" when omitted.',
  })
  @IsOptional()
  @IsString()
  position?: string;

  @ApiProperty({ description: 'Department id the manager is assigned to' })
  @Transform(toIdString)
  @IsNumberString()
  departmentId!: string;
}
