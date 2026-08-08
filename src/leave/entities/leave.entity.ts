import { Employee } from '@/employees/entities/employee.entity';
import {
  Column,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { LeaveStatus } from '../interfaces/leave.status';

@Entity('leave_request')
export class LeaveRequest {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @ManyToOne(() => Employee, (emp) => emp.leaveRequests)
  employee!: Employee;

  @Column()
  reason!: string;

  @Index()
  @Column({ type: 'date' })
  startDate!: string;

  @Column({ type: 'date' })
  endDate!: string;

  @Index()
  @Column({
    type: 'enum',
    enum: LeaveStatus,
    default: LeaveStatus.PENDING,
  })
  status!: LeaveStatus;
}
