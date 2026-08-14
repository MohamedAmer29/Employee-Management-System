import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ensures at most one attendance record exists per employee per day.
 *
 * The application already relies on this guarantee (the daily auto-absence job
 * computes the missing set and inserts with ON CONFLICT DO NOTHING), but the
 * rule must also be enforced by the database so a concurrent write or a
 * manually created record can never produce a duplicate.
 *
 * Implemented as a unique index with IF NOT EXISTS so the migration is safe to
 * (re)run even if the constraint was already created by `synchronize`.
 */
export class AddAttendanceEmployeeDateUnique1786600000000 implements MigrationInterface {
  name = 'AddAttendanceEmployeeDateUnique1786600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_attendance_employee_date" ON "attendance" ("employeeId", "date")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_attendance_employee_date"`,
    );
  }
}
