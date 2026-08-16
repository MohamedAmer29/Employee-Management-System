import { Employee } from '@/employees/entities/employee.entity';
import { User } from '@/users/entities/user.entity';
import { PayrollStatus } from '../enums/payroll-status.enum';
import { SalaryDeduction } from './salary-deduction.entity';
import { SalaryBonus } from './salary-bonus.entity';
import { MoneyColumn } from '../utils/money-column';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('compensation')
export class Compensation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * A compensation record targets either an employee or a manager (which is a
   * User with role=manager that owns an Employee profile). Exactly one of the
   * two is set - this is enforced by a partial unique index in the migration
   * and by the service layer.
   */
  @Index()
  @ManyToOne(() => Employee, { nullable: true, onDelete: 'CASCADE' })
  employee?: Employee;

  @Index()
  @ManyToOne(() => Employee, { nullable: true, onDelete: 'CASCADE' })
  manager?: Employee;

  @Column({ type: 'integer' })
  month!: number;

  @Column({ type: 'integer' })
  year!: number;

  @MoneyColumn()
  baseSalary!: number;

  @Column({ type: 'integer', default: 0 })
  workingDays!: number;

  @Column({ type: 'integer', default: 0 })
  attendedDays!: number;

  @Column({ type: 'integer', default: 0 })
  absentDays!: number;

  @Column({ type: 'integer', default: 0 })
  leaveDays!: number;

  @MoneyColumn()
  dailySalary!: number;

  @MoneyColumn()
  attendanceDeduction!: number;

  @MoneyColumn()
  totalDeductions!: number;

  @MoneyColumn()
  totalBonuses!: number;

  @MoneyColumn()
  netSalary!: number;

  @Column({
    type: 'enum',
    enum: PayrollStatus,
    default: PayrollStatus.CALCULATED,
  })
  status!: PayrollStatus;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  createdBy?: User;

  @OneToMany(() => SalaryDeduction, (deduction) => deduction.compensation)
  deductions!: SalaryDeduction[];

  @OneToMany(() => SalaryBonus, (bonus) => bonus.compensation)
  bonuses!: SalaryBonus[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
