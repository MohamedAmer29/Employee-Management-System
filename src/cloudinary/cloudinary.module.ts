import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CloudinaryService } from './cloudinary.service';

/**
 * Global module exposing the Cloudinary SDK wrapper. Credentials are read
 * from the environment through ConfigService (see config/cloudinary.config.ts).
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [CloudinaryService],
  exports: [CloudinaryService],
})
export class CloudinaryModule {}
