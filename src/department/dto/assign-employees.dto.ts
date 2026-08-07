import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID } from 'class-validator';

export class AssignEmployeesDto {
  @ApiProperty({
    description: 'List of employee IDs to assign to the department',
    type: [String],
  })
  @IsArray()
  @IsUUID('4', { each: true })
  employeeIds!: string[];
}
