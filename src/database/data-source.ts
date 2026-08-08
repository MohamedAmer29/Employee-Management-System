import { DataSource } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Employee } from '../employees/entities/employee.entity';
import { Department } from '../department/entities/department.entity';
import { Attendance } from '../attendance/entities/attendance.entity';
import { LeaveRequest } from '../leave/entities/leave.entity';
import { PerformanceReview } from '../performance/entities/performance';
import { Notification } from '../notifications/notification.entity';
import { AuditLog } from '../audit-logs/audit-log.entity';

/**
 * Standalone TypeORM DataSource used only by the TypeORM CLI for migrations.
 *
 * The running application configures TypeORM through getDatabaseConfig() and
 * does not use this file. It exists so `typeorm migration:run` can connect
 * without booting the whole Nest application.
 *
 * Entities are imported explicitly rather than by glob, because one entity
 * file (performance.ts) does not follow the *.entity.ts naming convention and
 * would be silently missed by a glob.
 */
const isCompiled = __filename.endsWith('.js');
const extension = isCompiled ? 'js' : 'ts';
const rootDir = isCompiled ? 'dist' : 'src';

// NOTE: this file intentionally does not import dotenv.
//
// Inside the container the environment is injected by Docker Compose, and
// dotenv is a devDependency that gets pruned from the production image.
// For local CLI use the npm scripts load .env via `dotenv/config`.

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST ?? process.env.HOST ?? 'localhost',
  port: Number(process.env.DATABASE_PORT ?? 5432),
  username: process.env.DATABASE_USERNAME,
  password: process.env.PASSWORD,
  database: process.env.DATABASE,
  entities: [
    User,
    Employee,
    Department,
    Attendance,
    LeaveRequest,
    PerformanceReview,
    Notification,
    AuditLog,
  ],
  migrations: [`${rootDir}/database/migrations/*.${extension}`],
  migrationsTableName: 'migrations',
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
});
