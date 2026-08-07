import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AssignUserDto {
  @ApiProperty({ description: 'User account id to assign to the employee' })
  @IsUUID()
  userId!: string;
}
