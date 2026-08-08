import { Employee } from '@/employees/entities/employee.entity';
import {
  Column,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('attendance')
export class Attendance {
  @PrimaryGeneratedColumn()
  id!: string;

  @Index()
  @ManyToOne(() => Employee, (emp) => emp.attendanceRecords)
  employee!: Employee;

  @Index()
  @Column({ type: 'date' })
  date!: string;

  @Column({ type: 'time', nullable: true })
  checkIn!: string;

  @Column({ type: 'time', nullable: true })
  checkOut!: string;

  @Column({ default: false })
  isPresent!: boolean;
}
