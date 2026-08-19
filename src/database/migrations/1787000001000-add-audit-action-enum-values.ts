import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the new audit action values introduced for registration, role
 * promotions, profile-image updates and password-reset flows.
 *
 * `ALTER TYPE ... ADD VALUE` is run outside a transaction (transaction:false)
 * because Postgres forbids adding enum values inside a transaction block on
 * older versions. IF NOT EXISTS keeps the migration idempotent.
 */
export class AddAuditActionEnumValues1787000001000 implements MigrationInterface {
  public transaction = false;

  private readonly values = [
    'USER_REGISTERED',
    'EMPLOYEE_PROMOTED_TO_MANAGER',
    'USER_PROMOTED_TO_ADMIN',
    'PROFILE_IMAGE_UPDATED',
    'PASSWORD_RESET_REQUESTED',
    'PASSWORD_RESET_COMPLETED',
    'PAYROLL_UPDATED',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const value of this.values) {
      await queryRunner.query(
        `ALTER TYPE "public"."audit_logs_action_enum" ADD VALUE IF NOT EXISTS '${value}'`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Postgres cannot remove a single enum value without recreating the type.
    // We intentionally leave the values in place on rollback to avoid
    // destroying the type and any dependent rows.
  }
}
