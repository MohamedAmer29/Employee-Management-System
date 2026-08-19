import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Matches } from 'class-validator';

export class VerifyResetOtpDto {
  @ApiProperty({
    description: 'The email address of the account',
    example: 'user@example.com',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase().trim() : value,
  )
  @IsEmail()
  email!: string;

  @ApiProperty({
    description: 'The 6-digit OTP sent to the email',
    example: '123456',
  })
  @IsString()
  @Matches(/^\d{4,10}$/, { message: 'otp must contain only digits' })
  otp!: string;
}
