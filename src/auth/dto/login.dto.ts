import { IsEmail, IsString, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
export class LoginDto {
  // username should be an email and not empty
  @ApiProperty({
    description: 'The email of the user',
    example: 'mohamed@gmail.com',
  })
  @IsEmail()
  username!: string;

  // password should be a string and not empty
  @ApiProperty({
    description: 'The password of the user',
    example: 'password',
  })
  @IsString()
  password!: string;

  // Optional "Remember me" flag. When true the refresh session lives longer
  // (JWT_REFRESH_REMEMBER_EXPIRES_IN). Defaults to false on the server.
  @ApiProperty({
    description:
      'When true the refresh session persists longer. Defaults to false.',
    required: false,
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}
