import { Employee } from '@/src/employees/entities/employee.entity';
import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { LeaveStatus } from '../interfaces/leave.status';

@Entity()
export class LeaveRequest {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Employee, (emp) => emp.leaveRequests)
  employee!: Employee;

  @Column()
  reason!: string;

  @Column({ type: 'date' })
  startDate!: string;

  @Column({ type: 'date' })
  endDate!: string;

  @Column({
    type: 'enum',
    enum: LeaveStatus,
    default: LeaveStatus.PENDING,
  })
  status!: LeaveStatus;
}
