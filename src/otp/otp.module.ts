import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OtpService } from './otp.service';

/**
 * OTP lifecycle module. RedisService is provided globally by RedisModule,
 * so only ConfigModule needs to be imported here.
 */
@Module({
  imports: [ConfigModule],
  providers: [OtpService],
  exports: [OtpService],
})
export class OtpModule {}
