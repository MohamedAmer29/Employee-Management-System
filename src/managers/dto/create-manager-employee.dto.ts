import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

/**
 * Managers add an existing employee to their department by email. The backend
 * resolves the employee id from the provided email; if no employee exists with
 * that email an error is returned. The resolved employee is then assigned to
 * the authenticated manager's department. Role and department are assigned
 * server-side, so those fields are intentionally absent.
 */
export class CreateManagerEmployeeDto {
  @ApiProperty({
    description:
      'Employee email used to look up the existing employee. The employee must already exist in the system.',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({ description: 'Employee position' })
  @IsString()
  @MinLength(2)
  position!: string;
}
