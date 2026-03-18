import { Employee } from '@/src/employees/entities/employee.entity';
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';

@Entity()
export class PerformanceReview {
  @PrimaryGeneratedColumn()
  id!: string;

  @ManyToOne(() => Employee, (emp) => emp.performanceReviews)
  employee!: Employee;

  @Column()
  reviewer!: string;

  @Column('text')
  feedback!: string;

  @Column('int')
  rating!: number;

  @Column({ type: 'date' })
  reviewDate!: string;
}
