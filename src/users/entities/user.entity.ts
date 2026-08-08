import { Role } from '@/auth/interfaces/Role.enum';
import { Employee } from '@/employees/entities/employee.entity';
import { AuditLog } from '@/audit-logs/audit-log.entity';
import { Notification } from '@/notifications/notification.entity';
import {
  Column,
  Entity,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('user')
export class User {
  @PrimaryGeneratedColumn()
  id!: string;

  @Column()
  firstName!: string;

  @Column()
  lastName!: string;

  @Column()
  country!: string;

  @Column()
  city!: string;

  @Column()
  phoneNumber!: string;

  @Column()
  nationalId!: string;

  @Column()
  username!: string;

  @Column()
  password!: string;

  @Column({ type: 'enum', enum: Role })
  role!: Role;

  @Column({ default: 0 })
  tokenVersion!: number;

  @Column({ default: true })
  isActive!: boolean;

  @Column({ default: false })
  isEmailVerified!: boolean;

  @Column({ type: 'timestamp', nullable: true })
  emailVerifiedAt!: Date | null;

  @OneToOne(() => Employee, (employee) => employee.user)
  @JoinColumn()
  employee!: Employee;

  @OneToMany(() => AuditLog, (auditLog) => auditLog.user)
  auditLogs!: AuditLog[];

  @OneToMany(() => Notification, (notification) => notification.user)
  notifications!: Notification[];
}
