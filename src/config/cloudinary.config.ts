import { ConfigService } from '@nestjs/config';
import { CloudinaryConfig } from '../cloudinary/interfaces/cloudinary-config.interface';

/**
 * Reads and validates Cloudinary configuration from the environment.
 *
 * getOrThrow is used deliberately: the application must not start silently
 * without Cloudinary credentials, otherwise profile-picture uploads would
 * fail for every user on their first attempt.
 */
export const getCloudinaryConfig = (
  configService: ConfigService,
): CloudinaryConfig => ({
  cloudName: configService.getOrThrow<string>('CLOUDINARY_CLOUD_NAME'),
  apiKey: configService.getOrThrow<string>('CLOUDINARY_API_KEY'),
  apiSecret: configService.getOrThrow<string>('CLOUDINARY_API_SECRET'),
});
