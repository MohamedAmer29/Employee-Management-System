import { Employee } from '@/src/employees/entities/employee.entity';
import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Attendance {
  @PrimaryGeneratedColumn()
  id!: string;

  @ManyToOne(() => Employee, (emp) => emp.attendanceRecords)
  employee!: Employee;

  @Column({ type: 'date' })
  date!: string;

  @Column({ type: 'time', nullable: true })
  checkIn!: string;

  @Column({ type: 'time', nullable: true })
  checkOut!: string;

  @Column({ default: false })
  isPresent!: boolean;
}
