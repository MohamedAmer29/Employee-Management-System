import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const getDatabaseConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => {
  const dbUrl = configService.get<string>('DATABASE_URL');
  const nodeEnv = configService.get<string>('NODE_ENV');
  const isProduction = nodeEnv === 'production';

  if (dbUrl && dbUrl.trim().length > 0) {
    return {
      type: 'postgres',
      url: dbUrl,
      ssl: dbUrl.includes('sslmode=require') || isProduction ? { rejectUnauthorized: false } : false,
      autoLoadEntities: true,
      synchronize: !isProduction,
      migrationsRun: false,
      logging: nodeEnv === 'development',
    };
  }

  const dbType = configService.get<string>('TYPE') ?? 'postgres';
  const validTypes = ['postgres', 'mysql', 'mariadb', 'sqlite', 'mssql'];
  if (!validTypes.includes(dbType as any)) {
    throw new Error(
      `Invalid database type: ${dbType}. Must be one of: ${validTypes.join(', ')}`,
    );
  }

  return {
    type: dbType as any,
    host: resolveDatabaseHost(configService),
    port: Number(configService.get<string>('DATABASE_PORT') ?? 5432),
    username: configService.get<string>('DATABASE_USERNAME'),
    password:
      configService.get<string>('DATABASE_PASSWORD') ??
      configService.get<string>('PASSWORD'),
    database:
      configService.get<string>('DATABASE_NAME') ??
      configService.get<string>('DATABASE'),
    ssl: isProduction ? { rejectUnauthorized: false } : false,
    autoLoadEntities: true,
    synchronize: !isProduction,
    migrationsRun: false,
    logging: nodeEnv === 'development',
  };
};

/**
 * Resolves the database host.
 *
 * DATABASE_HOST is checked first and is the variable to use in Docker, where
 * it should be set to the Compose service name (e.g. "postgres").
 *
 * HOSTNAME is deliberately NOT used: Docker automatically sets HOSTNAME to the
 * container's own ID inside every container, which would make the application
 * try to connect to itself.
 */
function resolveDatabaseHost(configService: ConfigService): string {
  return (
    configService.get<string>('DATABASE_HOST') ??
    configService.get<string>('HOST') ??
    'localhost'
  );
}
