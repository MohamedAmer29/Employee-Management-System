import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsNumberString,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { toIdString } from '@/common/transforms/id-string.transform';
import { TaskPriority } from '../enums/task-priority.enum';
import { TaskStatus } from '../enums/task-status.enum';

export class TaskQueryDto {
  @ApiProperty({ required: false, description: 'Page number', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ required: false, description: 'Items per page', default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @ApiProperty({
    required: false,
    description: 'Filter by status',
    enum: TaskStatus,
  })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiProperty({
    required: false,
    description: 'Filter by priority',
    enum: TaskPriority,
  })
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @ApiProperty({ required: false, description: 'Filter by assigned employee id' })
  @IsOptional()
  @Transform(toIdString)
  @IsNumberString()
  employeeId?: string;

  @ApiProperty({ required: false, description: 'Filter by assigned manager id' })
  @IsOptional()
  @Transform(toIdString)
  @IsNumberString()
  managerId?: string;

  @ApiProperty({ required: false, description: 'Filter by department id' })
  @IsOptional()
  @Transform(toIdString)
  @IsNumberString()
  departmentId?: string;

  @ApiProperty({ required: false, description: 'Filter by creator (user) id' })
  @IsOptional()
  @Transform(toIdString)
  @IsNumberString()
  createdById?: string;

  @ApiProperty({
    required: false,
    description: 'Filter by due date',
    type: 'string',
    format: 'date',
  })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiProperty({ required: false, description: 'Search by title' })
  @IsOptional()
  @IsString()
  search?: string;
}
