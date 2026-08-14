import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the `status` column to the `attendance` table so each daily record can
 * carry an explicit AttendanceStatus (PRESENT / ABSENT / LATE / ON_LEAVE).
 *
 * The `isPresent` boolean is intentionally kept for backward compatibility with
 * the dashboard attendance counters; the two are kept in sync by the service.
 *
 * Idempotent: the enum type is only created if missing, and the column is only
 * added if it does not already exist (so re-running or a parallel
 * `synchronize: true` cannot fail).
 */
export class AddAttendanceStatusColumn1786650000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE t.typname = 'attendance_status_enum'
        ) THEN
          CREATE TYPE "public"."attendance_status_enum" AS ENUM(
            'PRESENT', 'ABSENT', 'LATE', 'ON_LEAVE', 'EXCUSED'
          );
        END IF;
      END
      $$;
    `);

    await queryRunner.query(
      `ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "status" "public"."attendance_status_enum"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "attendance" DROP COLUMN IF EXISTS "status"`,
    );
  }
}
