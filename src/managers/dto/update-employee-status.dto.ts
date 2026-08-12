import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateEmployeeStatusDto {
  @ApiProperty({
    description: 'Active status of the employee',
    example: false,
  })
  @IsBoolean()
  isActive!: boolean;
}
