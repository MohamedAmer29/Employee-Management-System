import { Employee } from '@/employees/entities/employee.entity';
import { Department } from '@/department/entities/department.entity';
import { User } from '@/users/entities/user.entity';
import { TaskPriority } from '../enums/task-priority.enum';
import { TaskStatus } from '../enums/task-status.enum';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('task')
export class Task {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 255 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Index()
  @ManyToOne(() => Employee, { nullable: true, onDelete: 'CASCADE' })
  assignedEmployee?: Employee;

  @Index()
  @ManyToOne(() => Employee, { nullable: true, onDelete: 'CASCADE' })
  assignedManager?: Employee;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  createdBy!: User;

  @ManyToOne(() => Department, { nullable: true, onDelete: 'SET NULL' })
  department?: Department;

  @Column({
    type: 'enum',
    enum: TaskPriority,
    default: TaskPriority.MEDIUM,
  })
  priority!: TaskPriority;

  @Column({
    type: 'enum',
    enum: TaskStatus,
    default: TaskStatus.TODO,
  })
  status!: TaskStatus;

  @Column({ type: 'date', nullable: true })
  dueDate?: string;

  @Column({ type: 'timestamp', nullable: true })
  startedAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt?: Date;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
