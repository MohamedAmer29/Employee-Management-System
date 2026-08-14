import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { AttendanceService } from './attendance.service';
import { RedisService } from '@/redis/redis.service';

/**
 * Runs the daily automatic absence assignment. Kept deliberately thin: it only
 * acquires a distributed lock, triggers the business logic on AttendanceService
 * and logs the outcome. All attendance/Db logic lives in AttendanceService so
 * it stays reusable (manual trigger, admin endpoint, etc.).
 *
 * The cron `timeZone` is read from the environment because decorator options
 * are evaluated at class-definition time (before the DI container exists). The
 * same ATTENDANCE_TIMEZONE value is injected via ConfigService and reused for
 * the business-date computation so the trigger time and the processed day
 * always agree.
 */
@Injectable()
export class AttendanceSchedulerService {
  private readonly logger = new Logger(AttendanceSchedulerService.name);
  private readonly timezone: string;

  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {
    this.timezone =
      this.configService.get<string>('ATTENDANCE_TIMEZONE') ?? 'UTC';
  }

  @Cron('2 12 * * *', {
    timeZone: process.env.ATTENDANCE_TIMEZONE ?? 'UTC',
    name: 'auto-mark-absent',
  })
  async handleDailyAbsenceAssignment(): Promise<void> {
    const date = this.attendanceService.getBusinessDate(this.timezone);
    const lockKey = `attendance:auto-absence:${date}`;
    const lockTtlSeconds = 60 * 60;

    const lockAcquired = await this.redisService.acquireLock(
      lockKey,
      lockTtlSeconds,
    );
    if (!lockAcquired) {
      this.logger.warn(
        `Skipped automatic attendance check for ${date}: could not acquire the distributed lock ` +
          '(another instance may be running, or Redis is unavailable).',
      );
      return;
    }

    try {
      this.logger.log(
        `Starting automatic attendance check for ${date} at 12:02 PM`,
      );
      const startedAt = Date.now();
      const summary =
        await this.attendanceService.markEmployeesWithoutCheckInAsAbsent(date);
      const durationMs = Date.now() - startedAt;
      this.logger.log(
        `Automatic attendance check completed for ${date}: ` +
          `activeEmployees=${summary.totalActive}, ` +
          `alreadyCheckedIn=${summary.alreadyAttended}, ` +
          `markedAbsent=${summary.markedAbsent}, durationMs=${durationMs}`,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Automatic attendance check failed for ${date}: ${message}`,
      );
    } finally {
      await this.redisService.releaseLock(lockKey);
    }
  }
}
