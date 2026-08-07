import { IsEmail, IsString } from 'class-validator';
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
}
