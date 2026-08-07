import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from './error-code.enum';
import { ValidationError } from './exception-response.interface';

export class AppException extends HttpException {
  constructor(
    message: string,
    statusCode: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR,
    errorCode: ErrorCode = ErrorCode.INTERNAL_SERVER_ERROR,
    errors?: ValidationError[],
  ) {
    super(
      {
        success: false,
        statusCode,
        message,
        errorCode,
        errors,
        timestamp: new Date().toISOString(),
      },
      statusCode,
    );
  }
}
