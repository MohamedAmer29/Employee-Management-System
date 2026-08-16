import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the Task Management and Employee Compensation / Payroll feature:
 *  - enums: task_status, task_priority, payroll_status, deduction_type, bonus_type
 *  - tables: task, compensation, salary_deduction, salary_bonus, salary_history
 *
 * A `Compensation` targets either an employee or a manager (both stored as an
 * `employee` row, since managers are Users owning an Employee profile). The XOR
 * constraint is enforced with partial unique indexes so only one side of the
 * (employee / manager) pair may be set per payroll period.
 */
export class AddTasksAndPayroll1787000000000 implements MigrationInterface {
  name = 'AddTasksAndPayroll1787000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`,
    );

    // ---------------------------------------------------------------------
    // Enums
    // ---------------------------------------------------------------------
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                       WHERE t.typname = 'task_status_enum') THEN
          CREATE TYPE "public"."task_status_enum" AS ENUM('TODO','IN_PROGRESS','COMPLETED','CANCELLED','OVERDUE');
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                       WHERE t.typname = 'task_priority_enum') THEN
          CREATE TYPE "public"."task_priority_enum" AS ENUM('LOW','MEDIUM','HIGH','URGENT');
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                       WHERE t.typname = 'payroll_status_enum') THEN
          CREATE TYPE "public"."payroll_status_enum" AS ENUM('DRAFT','CALCULATED','APPROVED','PAID');
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                       WHERE t.typname = 'deduction_type_enum') THEN
          CREATE TYPE "public"."deduction_type_enum" AS ENUM('ABSENCE','LATE','UNPAID_LEAVE','DISCIPLINARY','OTHER');
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                       WHERE t.typname = 'bonus_type_enum') THEN
          CREATE TYPE "public"."bonus_type_enum" AS ENUM('PERFORMANCE','OVERTIME','ALLOWANCE','OTHER');
        END IF;
      END $$;
    `);

    // ---------------------------------------------------------------------
    // task
    // ---------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "task" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "title" character varying NOT NULL,
        "description" text,
        "assignedEmployeeId" integer,
        "assignedManagerId" integer,
        "createdById" integer,
        "departmentId" integer,
        "priority" "public"."task_priority_enum" NOT NULL DEFAULT 'MEDIUM',
        "status" "public"."task_status_enum" NOT NULL DEFAULT 'TODO',
        "dueDate" date,
        "startedAt" timestamp,
        "completedAt" timestamp,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_task" PRIMARY KEY ("id"),
        CONSTRAINT "FK_task_assigned_employee" FOREIGN KEY ("assignedEmployeeId") REFERENCES "employee"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_task_assigned_manager" FOREIGN KEY ("assignedManagerId") REFERENCES "employee"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_task_created_by" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_task_department" FOREIGN KEY ("departmentId") REFERENCES "department"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_task_assigned_employee" ON "task" ("assignedEmployeeId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_task_assigned_manager" ON "task" ("assignedManagerId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_task_created_by" ON "task" ("createdById")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_task_department" ON "task" ("departmentId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_task_status" ON "task" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_task_due_date" ON "task" ("dueDate")`,
    );

    // ---------------------------------------------------------------------
    // compensation
    // ---------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "compensation" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "employeeId" integer,
        "managerId" integer,
        "month" integer NOT NULL,
        "year" integer NOT NULL,
        "baseSalary" numeric(12,2) NOT NULL,
        "workingDays" integer NOT NULL DEFAULT 0,
        "attendedDays" integer NOT NULL DEFAULT 0,
        "absentDays" integer NOT NULL DEFAULT 0,
        "leaveDays" integer NOT NULL DEFAULT 0,
        "dailySalary" numeric(12,2) NOT NULL,
        "attendanceDeduction" numeric(12,2) NOT NULL,
        "totalDeductions" numeric(12,2) NOT NULL,
        "totalBonuses" numeric(12,2) NOT NULL,
        "netSalary" numeric(12,2) NOT NULL,
        "status" "public"."payroll_status_enum" NOT NULL DEFAULT 'CALCULATED',
        "createdById" integer,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_compensation" PRIMARY KEY ("id"),
        CONSTRAINT "FK_compensation_employee" FOREIGN KEY ("employeeId") REFERENCES "employee"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_compensation_manager" FOREIGN KEY ("managerId") REFERENCES "employee"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_compensation_created_by" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_compensation_employee" ON "compensation" ("employeeId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_compensation_manager" ON "compensation" ("managerId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_compensation_period" ON "compensation" ("month","year")`,
    );
    // XOR / one payroll record per person per period
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_compensation_employee_period" ON "compensation" ("employeeId","month","year") WHERE "employeeId" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_compensation_manager_period" ON "compensation" ("managerId","month","year") WHERE "managerId" IS NOT NULL`,
    );

    // ---------------------------------------------------------------------
    // salary_deduction
    // ---------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "salary_deduction" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "compensationId" uuid NOT NULL,
        "amount" numeric(12,2) NOT NULL,
        "type" "public"."deduction_type_enum" NOT NULL,
        "reason" text NOT NULL,
        "createdById" integer,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_salary_deduction" PRIMARY KEY ("id"),
        CONSTRAINT "FK_salary_deduction_compensation" FOREIGN KEY ("compensationId") REFERENCES "compensation"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_salary_deduction_created_by" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_salary_deduction_compensation" ON "salary_deduction" ("compensationId")`,
    );

    // ---------------------------------------------------------------------
    // salary_bonus
    // ---------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "salary_bonus" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "compensationId" uuid NOT NULL,
        "amount" numeric(12,2) NOT NULL,
        "type" "public"."bonus_type_enum" NOT NULL,
        "reason" text NOT NULL,
        "createdById" integer,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_salary_bonus" PRIMARY KEY ("id"),
        CONSTRAINT "FK_salary_bonus_compensation" FOREIGN KEY ("compensationId") REFERENCES "compensation"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_salary_bonus_created_by" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_salary_bonus_compensation" ON "salary_bonus" ("compensationId")`,
    );

    // ---------------------------------------------------------------------
    // salary_history
    // ---------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "salary_history" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "employeeId" integer,
        "managerId" integer,
        "previousSalary" numeric(12,2) NOT NULL,
        "newSalary" numeric(12,2) NOT NULL,
        "effectiveFrom" date NOT NULL,
        "reason" text,
        "createdById" integer,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_salary_history" PRIMARY KEY ("id"),
        CONSTRAINT "FK_salary_history_employee" FOREIGN KEY ("employeeId") REFERENCES "employee"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_salary_history_manager" FOREIGN KEY ("managerId") REFERENCES "employee"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_salary_history_created_by" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_salary_history_employee" ON "salary_history" ("employeeId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_salary_history_manager" ON "salary_history" ("managerId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "salary_history"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "salary_bonus"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "salary_deduction"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "compensation"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "task"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."bonus_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."deduction_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."payroll_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."task_priority_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."task_status_enum"`);
  }
}
