/* eslint-disable @typescript-eslint/no-unsafe-call */
import { IsEnum, IsString, IsStrongPassword } from 'class-validator';
import { Role } from '../interfaces/Role.enum';

export class RegisterDto {
  @IsString()
  username!: string;

  @IsStrongPassword()
  password!: string;

  @IsEnum(Role)
  role!: Role;
}
