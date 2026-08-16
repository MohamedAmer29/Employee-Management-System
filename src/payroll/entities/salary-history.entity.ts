import { Employee } from '@/employees/entities/employee.entity';
import { User } from '@/users/entities/user.entity';
import { MoneyColumn } from '../utils/money-column';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('salary_history')
export class SalaryHistory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * SalaryHistory tracks changes to the base salary of either an employee or a
   * manager (User with role=manager owning an Employee profile). Exactly one of
   * `employee` / `manager` is set, mirroring `Compensation`.
   */
  @Index()
  @ManyToOne(() => Employee, { nullable: true, onDelete: 'CASCADE' })
  employee?: Employee;

  @Index()
  @ManyToOne(() => Employee, { nullable: true, onDelete: 'CASCADE' })
  manager?: Employee;

  @MoneyColumn()
  previousSalary!: number;

  @MoneyColumn()
  newSalary!: number;

  @Column({ type: 'date' })
  effectiveFrom!: string;

  @Column({ type: 'text', nullable: true })
  reason?: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  createdBy?: User;

  @CreateDateColumn()
  createdAt!: Date;
}
