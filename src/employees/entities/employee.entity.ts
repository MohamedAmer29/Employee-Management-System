import { Role } from '@/auth/interfaces/Role.enum';
import { Attendance } from '@/attendance/entities/attendance.entity';
import { Department } from '@/department/entities/department.entity';
import { LeaveRequest } from '@/leave/entities/leave.entity';
import { PerformanceReview } from '@/performance/entities/performance';
import { User } from '@/users/entities/user.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('employee')
export class Employee {
  @PrimaryGeneratedColumn()
  id!: string;

  @Index()
  @Column({ default: false })
  isActive!: boolean;

  @Column()
  fullName!: string;

  @Column()
  email!: string;

  @Column()
  phone!: string;

  @Column()
  position!: string;

  @Column({ type: 'enum', enum: Role, nullable: true })
  role!: Role;

  @Column({ nullable: true })
  profilePicture?: string;

  @ManyToOne(() => Department, (dept) => dept.employees, { nullable: true })
  @Index()
  department?: Department;

  @OneToMany(() => Attendance, (att) => att.employee)
  attendanceRecords!: Attendance[];

  @OneToMany(() => LeaveRequest, (leave) => leave.employee)
  leaveRequests!: LeaveRequest[];

  @OneToMany(() => PerformanceReview, (review) => review.employee)
  performanceReviews!: PerformanceReview[];

  @OneToOne(() => User, (user) => user.employee)
  user!: User;

  @CreateDateColumn()
  createdAt!: Date;
}
