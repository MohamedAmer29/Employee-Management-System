import { ErrorCode } from './error-code.enum';

export interface ExceptionResponse {
  success: false;
  statusCode: number;
  message: string;
  errorCode: ErrorCode;
  errors?: ValidationError[];
  timestamp: string;
  path?: string;
}

export interface ValidationError {
  field: string;
  messages: string[];
}
