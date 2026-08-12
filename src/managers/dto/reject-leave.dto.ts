import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RejectLeaveDto {
  @ApiProperty({
    required: false,
    description: 'Reason for rejecting the leave request',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
