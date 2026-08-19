import { ApiProperty } from '@nestjs/swagger';
import { IsStrongPassword, IsString } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({
    description: 'The new password',
    example: 'NewPassword1@',
  })
  @IsStrongPassword()
  password!: string;

  @ApiProperty({
    description: 'Confirmation of the new password',
    example: 'NewPassword1@',
  })
  @IsString()
  confirmPassword!: string;
}
