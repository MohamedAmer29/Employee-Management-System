import { Role } from '@/src/auth/interfaces/Role.enum';
import { Employee } from '@/src/employees/entities/employee.entity';
import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity()
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

  @OneToOne(() => Employee, (employee) => employee.user)
  @JoinColumn()
  employee!: Employee;
}
