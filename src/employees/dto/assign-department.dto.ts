import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNumberString } from 'class-validator';
import { toIdString } from '../../common/transforms/id-string.transform';

export class AssignDepartmentDto {
  @ApiProperty({ description: 'Department id to assign to the employee' })
  @Transform(toIdString)
  @IsNumberString()
  departmentId!: string;
}
