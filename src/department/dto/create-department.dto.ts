import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class CreateDepartmentDto {
  @ApiProperty({ description: 'Department name', minLength: 2 })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name!: string;
}
