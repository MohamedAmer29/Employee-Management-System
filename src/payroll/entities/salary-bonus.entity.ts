import { Compensation } from './compensation.entity';
import { User } from '@/users/entities/user.entity';
import { BonusType } from '../enums/bonus-type.enum';
import { MoneyColumn } from '../utils/money-column';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('salary_bonus')
export class SalaryBonus {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @ManyToOne(() => Compensation, (comp) => comp.bonuses, {
    onDelete: 'CASCADE',
  })
  compensation!: Compensation;

  @MoneyColumn()
  amount!: number;

  @Column({ type: 'enum', enum: BonusType })
  type!: BonusType;

  @Column({ type: 'text' })
  reason!: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  createdBy?: User;

  @CreateDateColumn()
  createdAt!: Date;
}
