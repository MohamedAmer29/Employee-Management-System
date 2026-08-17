import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
} from 'class-validator';
import { toIdString } from '@/common/transforms/id-string.transform';
import { TaskPriority } from '../enums/task-priority.enum';

export class CreateTaskDto {
  @ApiProperty({ description: 'Task title' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({ description: 'Task description', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description:
      'Id of the employee the task is assigned to (XOR with managerId)',
    required: false,
  })
  @IsOptional()
  @Transform(toIdString)
  @IsNumberString()
  employeeId?: string;

  @ApiProperty({
    description:
      'Id of the manager the task is assigned to (XOR with employeeId)',
    required: false,
  })
  @IsOptional()
  @Transform(toIdString)
  @IsNumberString()
  managerId?: string;

  @ApiProperty({
    description: 'Task priority',
    enum: TaskPriority,
    default: TaskPriority.MEDIUM,
  })
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority = TaskPriority.MEDIUM;

  @ApiProperty({
    description: 'Due date',
    type: 'string',
    format: 'date',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
