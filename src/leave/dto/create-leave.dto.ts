import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsString } from 'class-validator';

export class CreateLeaveDto {
  @ApiProperty({ description: 'Reason for leave' })
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @ApiProperty({
    description: 'Leave start date',
    type: 'string',
    format: 'date',
  })
  @IsDateString()
  startDate!: string;

  @ApiProperty({
    description: 'Leave end date',
    type: 'string',
    format: 'date',
  })
  @IsDateString()
  endDate!: string;
}
