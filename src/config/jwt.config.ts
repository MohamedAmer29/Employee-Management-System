import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => ({
  secret: process.env.JWT_SECRET || 'secretKey',
  expiresIn: process.env.JWT_EXPIRES_IN || '1h',
  refreshSecret: process.env.REFRESH_SECRET || 'refreshSecretKey',
  refreshExpiresIn: process.env.REFRESH_EXPIRES_IN || '7d',
}));
