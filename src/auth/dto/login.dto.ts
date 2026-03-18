/* eslint-disable @typescript-eslint/no-unsafe-call */
import { IsEmail, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail()
  username!: string;
  @IsString()
  password!: string;
}
