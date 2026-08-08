import { IsEmail } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Shared by both POST /auth/send-verification-otp and
 * POST /auth/resend-verification-otp - the payload is identical, so the DTO is
 * reused rather than duplicated.
 *
 * The email is normalised at the validation boundary so the Redis keys built
 * downstream are always consistent.
 */
export class SendVerificationOtpDto {
  @ApiProperty({
    description: 'The email address (username) of the account to verify',
    example: 'mohamed@gmail.com',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase().trim() : value,
  )
  @IsEmail()
  email!: string;
}
