import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({ description: 'New password', minLength: 6 })
  @IsString()
  @MinLength(6)
  password!: string;
  @ApiProperty({ description: 'Confirm password', minLength: 6 })
  @IsString()
  @MinLength(6)
  confirmPassword!: string;
}
