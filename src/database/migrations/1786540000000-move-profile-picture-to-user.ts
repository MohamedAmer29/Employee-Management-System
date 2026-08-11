import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Move the profile picture to the "user" table and drop it from "employee".
 *
 * The user table is the single source of truth for profile pictures (admins,
 * managers and employees are all rows in "user"). Existing employee pictures
 * are copied to the linked user row before the employee column is removed.
 */
export class MoveProfilePictureToUser1786540000000
  implements MigrationInterface
{
  name = 'MoveProfilePictureToUser1786540000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // synchronize:true can drop the column before this migration runs. Only
    // copy + drop when the column still exists, so the migration is safe in
    // either order.
    const hasColumn = await queryRunner.query(
      `SELECT 1
         FROM information_schema.columns
         WHERE table_name = 'employee' AND column_name = 'profilePicture'`,
    );

    if (hasColumn.length > 0) {
      await queryRunner.query(
        `UPDATE "user" u
           SET "profilePicture" = e."profilePicture"
           FROM "employee" e
           WHERE e."userId" = u."id"
             AND e."profilePicture" IS NOT NULL
             AND u."profilePicture" IS NULL`,
      );

      await queryRunner.query(
        `ALTER TABLE "employee" DROP COLUMN "profilePicture"`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "employee" ADD COLUMN IF NOT EXISTS "profilePicture" character varying`,
    );

    await queryRunner.query(
      `UPDATE "employee" e
         SET "profilePicture" = u."profilePicture"
         FROM "user" u
         WHERE e."userId" = u."id"
           AND u."profilePicture" IS NOT NULL`,
    );
  }
}
