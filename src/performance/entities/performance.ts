import { Employee } from '@/employees/entities/employee.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Index,
} from 'typeorm';

@Entity('performance_review')
export class PerformanceReview {
  @PrimaryGeneratedColumn()
  id!: string;

  @Index()
  @ManyToOne(() => Employee, (emp) => emp.performanceReviews)
  employee!: Employee;

  @Column()
  reviewer!: string;

  @Column('text')
  feedback!: string;

  @Column('int')
  rating!: number;

  @Index()
  @Column({ type: 'date' })
  reviewDate!: string;
}
