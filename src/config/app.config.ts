import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  name: process.env.APP_NAME || 'Employee Management API',
  port: parseInt(process.env.PORT as string, 10) || 3000,
  apiPrefix: process.env.API_PREFIX || 'api/v1',
}));
