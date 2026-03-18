import { Role } from './Role.enum';

export interface Payload {
  sub: string;
  role: Role;
}
