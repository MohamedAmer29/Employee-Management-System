import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsNumberString } from 'class-validator';
import { toIdStringArray } from '../../common/transforms/id-string.transform';

export class AssignEmployeesDto {
  @ApiProperty({
    description: 'List of employee IDs to assign to the department',
    type: [String],
  })
  @IsArray()
  @Transform(toIdStringArray)
  @IsNumberString({}, { each: true })
  employeeIds!: string[];
}
