import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add the Cloudinary-backed profile picture URL to the "user" table.
 *
 * Admins, managers and employees are all rows in "user" (their role is the
 * discriminator), so a single nullable column gives every role a profile
 * picture. URLs are stored, never the image bytes.
 */
export class AddUserProfilePicture1786435200000 implements MigrationInterface {
  name = 'AddUserProfilePicture1786435200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "profilePicture" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN IF EXISTS "profilePicture"`,
    );
  }
}
