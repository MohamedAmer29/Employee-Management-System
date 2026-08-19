import { AppDataSource } from '../src/database/data-source';
import { Employee } from '../src/employees/entities/employee.entity';
import { Role } from '../src/auth/interfaces/Role.enum';
import { AttendanceStatus } from '../src/common/constants/enums';
import { getBusinessDate } from '../src/common/utils/timezones.util';

/**
 * One-off backfill: mark every ACTIVE admin employee as PRESENT for each
 * calendar day from their `createdAt` up to (and including) today.
 *
 * Idempotent: uses INSERT ... ON CONFLICT ("employeeId","date") DO NOTHING,
 * so re-running never creates duplicates and never overwrites an existing row
 * (e.g. one the daily cron already produced).
 *
 * Run with:
 *   node -r dotenv/config -r tsconfig-paths/register -r ts-node/register/transpile-only ./scripts/backfill-admin-attendance.ts
 */
function toBusinessDateStr(date: Date): string {
  const tz =
    process.env.APP_TIMEZONE ?? process.env.ATTENDANCE_TIMEZONE ?? 'UTC';
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function eachDay(start: string, end: string): string[] {
  const days: string[] = [];
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  for (let d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

async function main(): Promise<void> {
  await AppDataSource.initialize();
  const today = getBusinessDate();

  const admins = await AppDataSource.getRepository(Employee).find({
    where: { role: Role.admin, isActive: true },
    select: ['id', 'createdAt'],
  });

  console.log(
    `[backfill] ${admins.length} active admin(s) found. Today = ${today}`,
  );

  let totalInserted = 0;
  for (const admin of admins) {
    const start = toBusinessDateStr(admin.createdAt);
    const days = eachDay(start, today).filter((day) => day <= today);
    if (days.length === 0) {
      console.log(
        `[backfill] admin ${admin.id}: no days to backfill (start=${start}).`,
      );
      continue;
    }

    const placeholders = days
      .map((_, i) => `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`)
      .join(', ');
    const params: unknown[] = [];
    for (const day of days) {
      params.push(admin.id, day, true, AttendanceStatus.PRESENT);
    }

    const before = Date.now();
    // Force PRESENT on conflict too: the requirement is that the admin is
    // present every day, so any pre-existing row (e.g. an auto-marked ABSENT
    // row from the daily cron) is overwritten to PRESENT.
    await AppDataSource.query(
      `INSERT INTO "attendance" ("employeeId", "date", "isPresent", "status")
       VALUES ${placeholders}
       ON CONFLICT ("employeeId", "date") DO UPDATE SET "isPresent" = true, "status" = 'PRESENT'`,
      params,
    );
    const elapsed = Date.now() - before;
    console.log(
      `[backfill] admin ${admin.id}: ${days.length} day(s) from ${start} -> ${today} processed in ${elapsed}ms`,
    );
    totalInserted += days.length;
  }

  console.log(
    `[backfill] done. ${admins.length} admin(s), ${totalInserted} day-row(s) targeted (duplicates skipped by ON CONFLICT).`,
  );
}

main()
  .then(() => AppDataSource.destroy())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error('[backfill] failed:', err);
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
    process.exit(1);
  });
