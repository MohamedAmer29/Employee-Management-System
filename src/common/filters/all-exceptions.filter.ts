import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { QueryFailedError } from 'typeorm';
import { ValidationError as NestValidationError } from '@nestjs/common/interfaces/external/validation-error.interface';
import { ErrorCode } from '../exceptions/error-code.enum';
import {
  ExceptionResponse,
  ValidationError,
} from '../exceptions/exception-response.interface';
import { ERROR_MESSAGES } from '../constants/error-messages';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();
    const path = request.url;
    const method = request.method;
    const userId = request.user?.userId;

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = ERROR_MESSAGES.INTERNAL_SERVER_ERROR;
    let errorCode = ErrorCode.INTERNAL_SERVER_ERROR;
    let errors: ValidationError[] | undefined;

    // Handle HttpException (including AppException)
    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const responseObj = exceptionResponse as any;

        // Handle validation errors from ValidationPipe
        if (Array.isArray(responseObj.message)) {
          message = 'Validation failed';
          errorCode = ErrorCode.VALIDATION_ERROR;
          errors = this.formatValidationErrors(responseObj.message);
        } else {
          message = responseObj.message || message;
          errorCode =
            responseObj.errorCode || this.getErrorCodeFromStatus(statusCode);
          errors = responseObj.errors;
        }
      } else {
        message = exceptionResponse;
        errorCode = this.getErrorCodeFromStatus(statusCode);
      }

      this.logError(
        method,
        path,
        statusCode,
        userId,
        exception.message,
        exception,
      );
    }
    // Handle TypeORM/PostgreSQL errors
    else if (exception instanceof QueryFailedError) {
      const error = this.handleDatabaseError(exception);
      statusCode = error.statusCode;
      message = error.message;
      errorCode = error.errorCode;

      this.logError(
        method,
        path,
        statusCode,
        userId,
        exception.message,
        exception,
      );
    }
    // Handle unknown errors
    else {
      this.logError(
        method,
        path,
        statusCode,
        userId,
        'Unknown error',
        exception,
      );
    }

    const exceptionResponse: ExceptionResponse = {
      success: false,
      statusCode,
      message,
      errorCode,
      errors,
      timestamp: new Date().toISOString(),
      path,
    };

    response.status(statusCode).json(exceptionResponse);
  }

  private formatValidationErrors(
    errors: NestValidationError[],
  ): ValidationError[] {
    const formattedErrors: ValidationError[] = [];

    for (const error of errors) {
      const constraints = error.constraints;
      const messages = constraints ? Object.values(constraints) : [];

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

  private handleDatabaseError(exception: QueryFailedError): {
    statusCode: number;
    message: string;
    errorCode: ErrorCode;
  } {
    const driverError = exception.driverError as any;
    const code = driverError?.code;

    switch (code) {
      // Unique violation (duplicate entry)
      case '23505':
        return {
          statusCode: HttpStatus.CONFLICT,
          message: ERROR_MESSAGES.DUPLICATE_ENTRY,
          errorCode: ErrorCode.CONFLICT,
        };

      // Foreign key violation
      case '23503':
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          message: ERROR_MESSAGES.FOREIGN_KEY_VIOLATION,
          errorCode: ErrorCode.BAD_REQUEST,
        };

      // Not null violation
      case '23502':
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          message: ERROR_MESSAGES.BAD_REQUEST,
          errorCode: ErrorCode.BAD_REQUEST,
        };

      // Connection errors
      default:
        if (driverError?.message?.includes('connect')) {
          return {
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            message: ERROR_MESSAGES.DATABASE_CONNECTION_ERROR,
            errorCode: ErrorCode.DATABASE_ERROR,
          };
        }

        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: ERROR_MESSAGES.DATABASE_ERROR,
          errorCode: ErrorCode.DATABASE_ERROR,
        };
    }
  }

  private getErrorCodeFromStatus(statusCode: number): ErrorCode {
    switch (statusCode) {
      case HttpStatus.BAD_REQUEST:
        return ErrorCode.BAD_REQUEST;
      case HttpStatus.UNAUTHORIZED:
        return ErrorCode.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return ErrorCode.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ErrorCode.NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ErrorCode.CONFLICT;
      default:
        return ErrorCode.INTERNAL_SERVER_ERROR;
    }
  }

  private logError(
    method: string,
    path: string,
    statusCode: number,
    userId: string | undefined,
    message: string,
    exception: unknown,
  ): void {
    const userInfo = userId ? `User: ${userId}` : 'User: (anonymous)';
    const logMessage = `${method} ${path} - ${userInfo} - ${statusCode} - ${message}`;

    if (statusCode >= 500) {
      this.logger.error(
        logMessage,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(logMessage);
    }
  }
}
