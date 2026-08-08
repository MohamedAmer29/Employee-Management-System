import { IsEmail, IsEnum, IsString, IsStrongPassword } from 'class-validator';
import { Transform } from 'class-transformer';
import { Role } from '../interfaces/Role.enum';
import { ApiProperty } from '@nestjs/swagger';
export class RegisterDto {
  @ApiProperty({
    description: 'The first name of the user',
    example: 'Mohamed',
  })
  @IsString()
  firstName!: string;

  @ApiProperty({
    description: 'The last name of the user',
    example: 'Amer',
  })
  @IsString()
  lastName!: string;

  @ApiProperty({
    description: 'The country of the user',
    example: 'Egypt',
  })
  @IsString()
  country!: string;

  @ApiProperty({
    description: 'The city of the user',
    example: 'Cairo',
  })
  @IsString()
  city!: string;

  @ApiProperty({
    description: 'The phone number of the user',
    example: '+201234567890',
  })
  @IsString()
  phoneNumber!: string;

  @ApiProperty({
    description: 'The national ID of the user',
    example: '12345678901234',
  })
  @IsString()
  nationalId!: string;

  @ApiProperty({
    description:
      'The username of the user. This is also the email address the verification code is sent to.',
    example: 'mohamed@gmail.com',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase().trim() : value,
  )
  @IsEmail()
  username!: string;

  @ApiProperty({
    description: 'The password of the user',
    example: 'password',
  })
  @IsStrongPassword()
  password!: string;

  @ApiProperty({
    description: 'The role of the user',
    example: 'Admin',
  })
  @IsEnum(Role)
  role!: Role;
}
