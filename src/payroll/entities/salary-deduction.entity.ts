import { Compensation } from './compensation.entity';
import { User } from '@/users/entities/user.entity';
import { DeductionType } from '../enums/deduction-type.enum';
import { MoneyColumn } from '../utils/money-column';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('salary_deduction')
export class SalaryDeduction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @ManyToOne(() => Compensation, (comp) => comp.deductions, {
    onDelete: 'CASCADE',
  })
  compensation!: Compensation;

  @MoneyColumn()
  amount!: number;

  @Column({ type: 'enum', enum: DeductionType })
  type!: DeductionType;

  @Column({ type: 'text' })
  reason!: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  createdBy?: User;

  @CreateDateColumn()
  createdAt!: Date;
}
