import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const getDatabaseConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => {
  const dbType = configService.get<string>('TYPE');

  const validTypes = ['postgres', 'mysql', 'mariadb', 'sqlite', 'mssql'];
  if (!validTypes.includes(dbType as any)) {
    throw new Error(
      `Invalid database type: ${dbType}. Must be one of: ${validTypes.join(', ')}`,
    );
  }

  return {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    type: dbType as any,
    host: configService.get<string>('HOSTNAME'),
    port: Number(configService.get<number>('DATABASE_PORT')),
    username: configService.get<string>('DATABASE_USERNAME'),
    password: configService.get<string>('PASSWORD'),
    database: configService.get<string>('DATABASE'),
    autoLoadEntities: true,
    synchronize: configService.get<string>('NODE_ENV') === 'development',
    logging: configService.get<string>('NODE_ENV') === 'development',
  };
};
