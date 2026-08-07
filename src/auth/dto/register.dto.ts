import { IsEnum, IsString, IsStrongPassword } from 'class-validator';
import { Role } from '../interfaces/Role.enum';
import { ApiProperty } from '@nestjs/swagger';
export class RegisterDto {
  @ApiProperty({
    description: 'The username of the user',
    example: 'mohamed@gmail.com',
  })
  @IsString()
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
