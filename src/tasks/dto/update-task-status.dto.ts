import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { TaskStatus } from '../enums/task-status.enum';

export class UpdateTaskStatusDto {
  @ApiProperty({ description: 'New task status', enum: TaskStatus })
  @IsEnum(TaskStatus)
  @IsNotEmpty()
  status!: TaskStatus;
}
