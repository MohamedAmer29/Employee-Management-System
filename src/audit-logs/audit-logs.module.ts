import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from './audit-log.entity';
import { AuditLogsController } from './audit-logs.controller';
import { AuditLogsService } from './audit-logs.service';
import { User } from '@/users/entities/user.entity';
import { AuditLogsListener } from './audit-logs.listener';

@Module({
  imports: [TypeOrmModule.forFeature([AuditLog, User])],
  controllers: [AuditLogsController],
  providers: [AuditLogsService, AuditLogsListener],
  exports: [AuditLogsService],
})
export class AuditLogsModule {}
