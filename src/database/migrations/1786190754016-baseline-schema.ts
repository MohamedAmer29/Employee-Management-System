import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Baseline schema for the EMS database.
 *
 * Generated with `typeorm migration:generate` from the current entities, so it
 * is guaranteed to match them exactly.
 *
 * Why this replaces the three earlier migration files
 * ---------------------------------------------------
 * The schema had only ever been created by `synchronize: true`. The previous
 * migrations could not actually run:
 *   - their class-name suffixes were 12-digit dates, not JS millisecond
 *     timestamps, which TypeORM rejects outright;
 *   - they declared audit_logs.userId / notifications.userId as varchar while
 *     the entities map them to integer foreign keys on "user";
 *   - no migration created the core tables (user, employee, department, ...)
 *     that the email-verification migration depended on.
 *
 * This single migration creates the whole schema consistently, including the
 * audit_logs and notifications tables and the isEmailVerified /
 * emailVerifiedAt columns.
 *
 * Applying to a database that already has tables from `synchronize: true`
 * ----------------------------------------------------------------------
 * Do NOT run this against such a database - it will fail on the first
 * CREATE TABLE. Instead record it as already applied:
 *
 *   INSERT INTO migrations ("timestamp", name)
 *   VALUES (1786190754016, 'Baseline1786190754016');
 *
 * Existing users are treated as verified by the back-fill at the end of up(),
 * so introducing email verification does not lock them out.
 */
export class Baseline1786190754016 implements MigrationInterface {
  name = 'Baseline1786190754016';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(
      `CREATE TABLE "attendance" ("id" SERIAL NOT NULL, "date" date NOT NULL, "checkIn" TIME, "checkOut" TIME, "isPresent" boolean NOT NULL DEFAULT false, "employeeId" integer, CONSTRAINT "PK_ee0ffe42c1f1a01e72b725c0cb2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_07731c02b0333dc9b2678f9821" ON "attendance" ("employeeId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ff05fd5159e6d9d99514d46531" ON "attendance" ("date") `,
    );
    await queryRunner.query(
      `CREATE TABLE "department" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, CONSTRAINT "UQ_471da4b90e96c1ebe0af221e07b" UNIQUE ("name"), CONSTRAINT "PK_9a2213262c1593bffb581e382f5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."leave_request_status_enum" AS ENUM('pending', 'approved', 'rejected')`,
    );
    await queryRunner.query(
      `CREATE TABLE "leave_request" ("id" SERIAL NOT NULL, "reason" character varying NOT NULL, "startDate" date NOT NULL, "endDate" date NOT NULL, "status" "public"."leave_request_status_enum" NOT NULL DEFAULT 'pending', "employeeId" integer, CONSTRAINT "PK_6f6ed3822203a4e10a5753368db" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_03889549dbbc56e2a9f5ce107a" ON "leave_request" ("employeeId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3dcf71b0053da6766e2a2b3a9e" ON "leave_request" ("startDate") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4ee8adc97f34bfa2b4bda14f21" ON "leave_request" ("status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "performance_review" ("id" SERIAL NOT NULL, "reviewer" character varying NOT NULL, "feedback" text NOT NULL, "rating" integer NOT NULL, "reviewDate" date NOT NULL, "employeeId" integer, CONSTRAINT "PK_9eb5dcdf559f23cb1d948eec1b5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b3466a603833fa80ab12b27ddc" ON "performance_review" ("employeeId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2b5a5b21a6a4d47d76ea55bff7" ON "performance_review" ("reviewDate") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."employee_role_enum" AS ENUM('Admin', 'Manager', 'Employee')`,
    );
    await queryRunner.query(
      `CREATE TABLE "employee" ("id" SERIAL NOT NULL, "isActive" boolean NOT NULL DEFAULT false, "fullName" character varying NOT NULL, "email" character varying NOT NULL, "phone" character varying NOT NULL, "position" character varying NOT NULL, "role" "public"."employee_role_enum", "profilePicture" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "departmentId" integer, CONSTRAINT "PK_3c2bc72f03fd5abbbc5ac169498" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_510cb87f5da169e57e694d1a5c" ON "employee" ("isActive") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9ad20e4029f9458b6eed0b0c45" ON "employee" ("departmentId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."audit_logs_action_enum" AS ENUM('LOGIN', 'LOGOUT', 'LOGIN_FAILED', 'CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT', 'CHECK_IN', 'CHECK_OUT', 'PASSWORD_CHANGE', 'ROLE_CHANGE')`,
    );
    await queryRunner.query(
      `CREATE TABLE "audit_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" integer, "action" "public"."audit_logs_action_enum" NOT NULL, "entity" character varying, "entityId" character varying, "description" text, "oldValues" jsonb, "newValues" jsonb, "ipAddress" character varying, "userAgent" character varying, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cfa83f61e4d27a87fcae1e025a" ON "audit_logs" ("userId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cee5459245f652b75eb2759b4c" ON "audit_logs" ("action") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_445557993007fefee3aa9f1117" ON "audit_logs" ("entity") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f23279fad63453147a8efb46cf" ON "audit_logs" ("entityId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."notifications_type_enum" AS ENUM('LEAVE_REQUEST', 'LEAVE_APPROVED', 'LEAVE_REJECTED', 'PERFORMANCE_REVIEW', 'ATTENDANCE', 'EMPLOYEE_UPDATE', 'SYSTEM')`,
    );
    await queryRunner.query(
      `CREATE TABLE "notifications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" integer NOT NULL, "type" "public"."notifications_type_enum" NOT NULL, "title" character varying NOT NULL, "message" text NOT NULL, "isRead" boolean NOT NULL DEFAULT false, "readAt" TIMESTAMP, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_692a909ee0fa9383e7859f9b40" ON "notifications" ("userId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_77ee7b06d6f802000c0846f3a5" ON "notifications" ("created_at") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."user_role_enum" AS ENUM('Admin', 'Manager', 'Employee')`,
    );
    await queryRunner.query(
      `CREATE TABLE "user" ("id" SERIAL NOT NULL, "firstName" character varying NOT NULL, "lastName" character varying NOT NULL, "country" character varying NOT NULL, "city" character varying NOT NULL, "phoneNumber" character varying NOT NULL, "nationalId" character varying NOT NULL, "username" character varying NOT NULL, "password" character varying NOT NULL, "role" "public"."user_role_enum" NOT NULL, "tokenVersion" integer NOT NULL DEFAULT '0', "isActive" boolean NOT NULL DEFAULT true, "isEmailVerified" boolean NOT NULL DEFAULT false, "emailVerifiedAt" TIMESTAMP, "employeeId" integer, CONSTRAINT "REL_ab4a80281f1e8d524714e00f38" UNIQUE ("employeeId"), CONSTRAINT "PK_cace4a159ff9f2512dd42373760" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendance" ADD CONSTRAINT "FK_07731c02b0333dc9b2678f98213" FOREIGN KEY ("employeeId") REFERENCES "employee"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_request" ADD CONSTRAINT "FK_03889549dbbc56e2a9f5ce107a0" FOREIGN KEY ("employeeId") REFERENCES "employee"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "performance_review" ADD CONSTRAINT "FK_b3466a603833fa80ab12b27ddcd" FOREIGN KEY ("employeeId") REFERENCES "employee"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee" ADD CONSTRAINT "FK_9ad20e4029f9458b6eed0b0c454" FOREIGN KEY ("departmentId") REFERENCES "department"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD CONSTRAINT "FK_cfa83f61e4d27a87fcae1e025ab" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "FK_692a909ee0fa9383e7859f9b406" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD CONSTRAINT "FK_ab4a80281f1e8d524714e00f38f" FOREIGN KEY ("employeeId") REFERENCES "employee"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );

    // Grandfather in any pre-existing accounts so enabling email verification
    // does not lock out users created before the feature existed.
    // This is a no-op on a fresh database.
    await queryRunner.query(
      `UPDATE "user"
          SET "isEmailVerified" = true,
              "emailVerifiedAt" = CURRENT_TIMESTAMP
        WHERE "isEmailVerified" = false
          AND "emailVerifiedAt" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" DROP CONSTRAINT "FK_ab4a80281f1e8d524714e00f38f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP CONSTRAINT "FK_692a909ee0fa9383e7859f9b406"`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" DROP CONSTRAINT "FK_cfa83f61e4d27a87fcae1e025ab"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee" DROP CONSTRAINT "FK_9ad20e4029f9458b6eed0b0c454"`,
    );
    await queryRunner.query(
      `ALTER TABLE "performance_review" DROP CONSTRAINT "FK_b3466a603833fa80ab12b27ddcd"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_request" DROP CONSTRAINT "FK_03889549dbbc56e2a9f5ce107a0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendance" DROP CONSTRAINT "FK_07731c02b0333dc9b2678f98213"`,
    );
    await queryRunner.query(`DROP TABLE "user"`);
    await queryRunner.query(`DROP TYPE "public"."user_role_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_77ee7b06d6f802000c0846f3a5"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_692a909ee0fa9383e7859f9b40"`,
    );
    await queryRunner.query(`DROP TABLE "notifications"`);
    await queryRunner.query(`DROP TYPE "public"."notifications_type_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f23279fad63453147a8efb46cf"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_445557993007fefee3aa9f1117"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_cee5459245f652b75eb2759b4c"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_cfa83f61e4d27a87fcae1e025a"`,
    );
    await queryRunner.query(`DROP TABLE "audit_logs"`);
    await queryRunner.query(`DROP TYPE "public"."audit_logs_action_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9ad20e4029f9458b6eed0b0c45"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_510cb87f5da169e57e694d1a5c"`,
    );
    await queryRunner.query(`DROP TABLE "employee"`);
    await queryRunner.query(`DROP TYPE "public"."employee_role_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_2b5a5b21a6a4d47d76ea55bff7"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_b3466a603833fa80ab12b27ddc"`,
    );
    await queryRunner.query(`DROP TABLE "performance_review"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_4ee8adc97f34bfa2b4bda14f21"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_3dcf71b0053da6766e2a2b3a9e"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_03889549dbbc56e2a9f5ce107a"`,
    );
    await queryRunner.query(`DROP TABLE "leave_request"`);
    await queryRunner.query(`DROP TYPE "public"."leave_request_status_enum"`);
    await queryRunner.query(`DROP TABLE "department"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ff05fd5159e6d9d99514d46531"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_07731c02b0333dc9b2678f9821"`,
    );
    await queryRunner.query(`DROP TABLE "attendance"`);
  }
}
