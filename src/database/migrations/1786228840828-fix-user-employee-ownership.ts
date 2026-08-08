import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Move ownership of the User <-> Employee one-to-one relationship from the
 * "user" table to the "employee" table.
 *
 * Previously the owning side lived on User (User had a nullable "employeeId"
 * FK column pointing at employee.id). The owning side must be Employee, so the
 * foreign key now lives on employee.userId and references user.id.
 *
 * Changes:
 *   - user.employeeId (column, unique constraint, FK) is removed
 *   - employee.userId (column, unique constraint, FK ON DELETE CASCADE) is added
 *
 * The unique constraint keeps the one-to-one guarantee: one user can only be
 * referenced by a single employee row.
 *
 * This migration is written to be safe both against databases that still have
 * the old schema (baseline) and databases already created by `synchronize: true`
 * against the updated entities.
 */
export class FixUserEmployeeOwnership1786228840828 implements MigrationInterface {
  name = 'FixUserEmployeeOwnership1786228840828';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Remove the old owning side from "user".
    await queryRunner.query(
      `ALTER TABLE "user" DROP CONSTRAINT IF EXISTS "FK_ab4a80281f1e8d524714e00f38f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" DROP CONSTRAINT IF EXISTS "REL_ab4a80281f1e8d524714e00f38"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN IF EXISTS "employeeId"`,
    );

    // 2. Add the owning side to "employee".
    await queryRunner.query(
      `ALTER TABLE "employee" ADD COLUMN IF NOT EXISTS "userId" integer`,
    );

    // 3. One-to-one guarantee: employees.userId must be unique.
    await queryRunner.query(
      `DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'UQ_f4b0d329c4a3cf79ffe9d565047'
          ) THEN
            ALTER TABLE "employee"
              ADD CONSTRAINT "UQ_f4b0d329c4a3cf79ffe9d565047" UNIQUE ("userId");
          END IF;
        END $$`,
    );

    // 4. Foreign key employees.userId -> users.id. Deleting a user removes its
    //    employee row (ON DELETE CASCADE).
    await queryRunner.query(
      `DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'FK_f4b0d329c4a3cf79ffe9d565047'
          ) THEN
            ALTER TABLE "employee"
              ADD CONSTRAINT "FK_f4b0d329c4a3cf79ffe9d565047"
              FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE;
          END IF;
        END $$`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove the owning side from "employee".
    await queryRunner.query(
      `ALTER TABLE "employee" DROP CONSTRAINT IF EXISTS "FK_f4b0d329c4a3cf79ffe9d565047"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee" DROP CONSTRAINT IF EXISTS "UQ_f4b0d329c4a3cf79ffe9d565047"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee" DROP COLUMN IF EXISTS "userId"`,
    );

    // Restore the old owning side on "user".
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "employeeId" integer`,
    );
    await queryRunner.query(
      `DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'REL_ab4a80281f1e8d524714e00f38'
          ) THEN
            ALTER TABLE "user"
              ADD CONSTRAINT "REL_ab4a80281f1e8d524714e00f38" UNIQUE ("employeeId");
          END IF;
        END $$`,
    );
    await queryRunner.query(
      `DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'FK_ab4a80281f1e8d524714e00f38f'
          ) THEN
            ALTER TABLE "user"
              ADD CONSTRAINT "FK_ab4a80281f1e8d524714e00f38f"
              FOREIGN KEY ("employeeId") REFERENCES "employee"("id")
                ON DELETE NO ACTION ON UPDATE NO ACTION;
          END IF;
        END $$`,
    );
  }
}
