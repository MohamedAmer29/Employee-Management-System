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
  username!: string;

  @Column()
  password!: string;

  @Column({ type: 'enum', enum: Role })
  role!: Role;

  @OneToOne(() => Employee, (employee) => employee.user)
  @JoinColumn()
  employee!: Employee;
}
