import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { getCloudinaryConfig } from '../config/cloudinary.config';

export type CloudinaryUploadFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
};

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);
  private readonly folder = 'profile-pictures';

  constructor(configService: ConfigService) {
    const config = getCloudinaryConfig(configService);
    cloudinary.config({
      cloud_name: config.cloudName,
      api_key: config.apiKey,
      api_secret: config.apiSecret,
    });
  }

  /**
   * Streams an image buffer to Cloudinary and returns the secure URL.
   */
  async uploadImage(file: CloudinaryUploadFile): Promise<string> {
    const upload = (): Promise<UploadApiResponse> =>
      new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: this.folder,
            resource_type: 'image',
          },
          (error, result) => {
            if (error) {
              reject(new Error(error.message ?? 'Cloudinary upload failed'));
              return;
            }
            resolve(result as UploadApiResponse);
          },
        );

        stream.end(file.buffer);
      });

    try {
      const result = await upload();
      return result.secure_url;
    } catch (error) {
      this.logger.error(
        `Cloudinary upload failed for "${file.originalname}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    }
  }

  /**
   * Deletes a previously uploaded image by its URL. Best-effort: the
   * cloud_name is matched so only Cloudinary URLs are ever touched.
   */
  async deleteImage(secureUrl: string): Promise<void> {
    const publicId = this.extractPublicId(secureUrl);

    if (!publicId) {
      return;
    }

    try {
      await cloudinary.uploader.destroy(publicId);
    } catch (error) {
      this.logger.warn(
        `Cloudinary delete failed for "${secureUrl}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Extracts the Cloudinary public id (folder + filename without extension)
   * from a secure URL, e.g.
   * .../image/upload/v123456/profile-pictures/abc.jpg -> profile-pictures/abc
   */
  private extractPublicId(secureUrl: string): string | null {
    if (!secureUrl.includes(cloudinary.config().cloud_name ?? '')) {
      return null;
    }

    const match = secureUrl.match(/\/image\/upload\/(?:v\d+\/)?(.+)$/);

    if (!match?.[1]) {
      return null;
    }

    return match[1].replace(/\.[a-zA-Z0-9]+$/, '');
  }
}
