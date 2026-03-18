import { Employee } from '@/src/employees/entities/employee.entity';
import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Department {
  @PrimaryGeneratedColumn()
  id!: string;

  @Column()
  name!: string;

  @OneToMany(() => Employee, (emp) => emp.department)
  employees!: Employee[];
}
