import { Employee } from '@/employees/entities/employee.entity';
import { AttendanceStatus } from '@/common/constants/enums';
import {
  Column,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

@Entity('attendance')
@Unique(['employee', 'date'])
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

  @Column({
    type: 'enum',
    enum: AttendanceStatus,
    nullable: true,
  })
  status?: AttendanceStatus;
}
