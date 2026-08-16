import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Task } from './entities/task.entity';
import { Employee } from '@/employees/entities/employee.entity';
import { User } from '@/users/entities/user.entity';
import { Department } from '@/department/entities/department.entity';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { NotificationsModule } from '@/notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Task, Employee, User, Department]),
    NotificationsModule,
  ],
  controllers: [TasksController],
  providers: [TasksService],
})
export class TasksModule {}
