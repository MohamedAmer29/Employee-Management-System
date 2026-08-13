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

export class AddAdminDto {
  @ApiProperty({ description: 'First name' })
  @IsString()
  @MinLength(2)
  firstName!: string;

  @ApiProperty({ description: 'Last name' })
  @IsString()
  @MinLength(2)
  lastName!: string;

  @ApiProperty({ description: 'Login email' })
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
    description:
      'Optional department id. Admins usually have no department; provide one only if the admin should also manage a department.',
  })
  @IsOptional()
  @Transform(toIdString)
  @IsNumberString()
  departmentId?: string;
}
