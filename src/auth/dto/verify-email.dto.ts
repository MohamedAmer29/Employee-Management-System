import { IsEmail, IsString, Length, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyEmailDto {
  @ApiProperty({
    description: 'The email address (username) of the account to verify',
    example: 'mohamed@gmail.com',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase().trim() : value,
  )
  @IsEmail()
  email!: string;

  @ApiProperty({
    description: 'The 6-digit verification code sent by email',
    example: '000000',
    minLength: 6,
    maxLength: 6,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, {
    message: 'otp must contain exactly 6 digits',
  })
  otp!: string;
}
