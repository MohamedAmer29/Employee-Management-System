import { Role } from '@/src/auth/interfaces/Role.enum';
import { Attendance } from '@/src/attendance/entities/attendance.entity';
import { Department } from '@/src/department/entities/department.entity';
import { LeaveRequest } from '@/src/leave/entities/leave.entity';
import { PerformanceReview } from '@/src/performance/entities/performance';
import { User } from '@/src/users/entities/user.entity';
import {
  Column,
  Entity,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity()
export class Employee {
  @PrimaryGeneratedColumn()
  id!: string;

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
  department?: Department;

  @OneToMany(() => Attendance, (att) => att.employee)
  attendanceRecords!: Attendance[];

  @OneToMany(() => LeaveRequest, (leave) => leave.employee)
  leaveRequests!: LeaveRequest[];

  @OneToMany(() => PerformanceReview, (review) => review.employee)
  performanceReviews!: PerformanceReview[];

  @OneToOne(() => User, (user) => user.employee)
  user!: User;
}
