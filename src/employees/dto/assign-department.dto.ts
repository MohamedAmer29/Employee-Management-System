import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AssignDepartmentDto {
  @ApiProperty({ description: 'Department id to assign to the employee' })
  @IsUUID()
  departmentId!: string;
}
