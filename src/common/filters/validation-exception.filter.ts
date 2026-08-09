import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { ValidationError as NestValidationError } from '@nestjs/common/interfaces/external/validation-error.interface';
import { ErrorCode } from '../exceptions/error-code.enum';
import {
  ExceptionResponse,
  ValidationError,
} from '../exceptions/exception-response.interface';

@Catch()
export class ValidationExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ValidationExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();
    const path = request.url;
    const method = request.method;
    const userId = request.user?.userId;

    // Check if this is a validation error
    if (
      exception instanceof HttpException &&
      exception.getStatus() === HttpStatus.BAD_REQUEST
    ) {
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const responseObj = exceptionResponse as any;

        // Check if it's a validation error from ValidationPipe
        if (Array.isArray(responseObj.message)) {
          const errors = this.formatValidationErrors(responseObj.message);

          const exceptionResponse: ExceptionResponse = {
            success: false,
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'Validation failed',
            errorCode: ErrorCode.VALIDATION_ERROR,
            errors,
            timestamp: new Date().toISOString(),
            path,
          };

          const userInfo = userId ? `User: ${userId}` : 'User: (anonymous)';
          this.logger.warn(
            `${method} ${path} - ${userInfo} - Validation failed: ${JSON.stringify(errors)}`,
          );

          return response
            .status(HttpStatus.BAD_REQUEST)
            .json(exceptionResponse);
        }
      }
    }

    // If not a validation error, let the AllExceptionsFilter handle it
    throw exception;
  }

  private formatValidationErrors(
    errors: Array<NestValidationError | string>,
  ): ValidationError[] {
    const formattedErrors: ValidationError[] = [];

    for (const error of errors) {
      // Defensive: a BadRequestException can carry flattened string messages
      // instead of ValidationError objects.
      if (typeof error === 'string') {
        formattedErrors.push({ field: 'unknown', messages: [error] });
        continue;
      }

      const constraints = error.constraints;
      let messages = constraints ? Object.values(constraints) : [];

      // Whitelist rejections (forbidNonWhitelisted) carry no constraints and
      // no children - surface the offending property instead of an empty list.
      if (
        messages.length === 0 &&
        (!error.children || error.children.length === 0)
      ) {
        messages = [`${error.property} is not allowed`];
      }

      formattedErrors.push({
        field: error.property,
        messages,
      });

      // Handle nested validation errors
      if (error.children && error.children.length > 0) {
        const nestedErrors = this.formatValidationErrors(error.children);
        for (const nestedError of nestedErrors) {
          formattedErrors.push({
            field: `${error.property}.${nestedError.field}`,
            messages: nestedError.messages,
          });
        }
      }
    }

    return formattedErrors;
  }
}
