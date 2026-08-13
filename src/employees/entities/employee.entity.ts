import { Role } from '@/auth/interfaces/Role.enum';
import { Attendance } from '@/attendance/entities/attendance.entity';
import { Department } from '@/department/entities/department.entity';
import { LeaveRequest } from '@/leave/entities/leave.entity';
import { PerformanceReview } from '@/performance/entities/performance';
import { User } from '@/users/entities/user.entity';
import {
  BeforeInsert,
  BeforeUpdate,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
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

  @ManyToOne(() => Department, (dept) => dept.employees, { nullable: true })
  @Index()
  department?: Department;

  @OneToMany(() => Attendance, (att) => att.employee)
  attendanceRecords!: Attendance[];

  @OneToMany(() => LeaveRequest, (leave) => leave.employee)
  leaveRequests!: LeaveRequest[];

  @OneToMany(() => PerformanceReview, (review) => review.employee)
  performanceReviews!: PerformanceReview[];

  @OneToOne(() => User, (user) => user.employee, {
    onDelete: 'CASCADE',
  })
  @JoinColumn()
  user!: User;

  @CreateDateColumn()
  createdAt!: Date;

  /**
   * Keep the contact/identity columns in sync with the linked User account so
   * the employee profile never drifts from the credentials used to sign in.
   * These values are intentionally derived from `user` and not authored
   * independently. The guard skips when no linked user is present (standalone
   * employees) or when the relation is only partially loaded.
   */
  @BeforeInsert()
  @BeforeUpdate()
  syncFromUser?(): void {
    if (!this.user) {
      return;
    }

    if (this.user.username !== undefined) {
      this.email = this.user.username;
    }
    if (this.user.phoneNumber !== undefined) {
      this.phone = this.user.phoneNumber;
    }
    if (this.user.role !== undefined) {
      this.role = this.user.role;
    }
    if (this.user.isActive !== undefined) {
      this.isActive = this.user.isActive;
    }
    if (this.user.firstName !== undefined && this.user.lastName !== undefined) {
      this.fullName = `${this.user.firstName} ${this.user.lastName}`;
    }
  }
}
