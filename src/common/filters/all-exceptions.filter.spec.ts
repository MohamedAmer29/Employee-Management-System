import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { ErrorCode } from '../exceptions/error-code.enum';
import { ERROR_MESSAGES } from '../constants/error-messages';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;
  let host: any;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });

    host = {
      switchToHttp: () => ({
        getResponse: () => ({ status: statusMock }),
        getRequest: () => ({
          url: '/test',
          method: 'GET',
          user: undefined,
        }),
      }),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should handle an HttpException with a string message', () => {
    filter.catch(new NotFoundException('Not found'), host);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Not found',
        errorCode: ErrorCode.NOT_FOUND,
      }),
    );
  });

  it('should format validation errors from the ValidationPipe', () => {
    const exception = new BadRequestException({
      message: [
        {
          property: 'name',
          constraints: { isString: 'name must be a string' },
        },
        {
          property: 'email',
          constraints: { isEmail: 'email must be an email' },
        },
      ],
    });

    filter.catch(exception, host);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Validation failed',
        errorCode: ErrorCode.VALIDATION_ERROR,
        errors: [
          { field: 'name', messages: ['name must be a string'] },
          { field: 'email', messages: ['email must be an email'] },
        ],
      }),
    );
  });

  it('should preserve a custom error code from the exception response', () => {
    const exception = new HttpException(
      { message: 'Custom error', errorCode: ErrorCode.CONFLICT },
      HttpStatus.CONFLICT,
    );

    filter.catch(exception, host);

    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.CONFLICT,
        message: 'Custom error',
        errorCode: ErrorCode.CONFLICT,
      }),
    );
  });

  it('should handle a unique violation database error', () => {
    const queryFailedError = new QueryFailedError('SELECT 1', [], {
      code: '23505',
      message: 'duplicate key value',
    } as any);

    filter.catch(queryFailedError, host);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: ERROR_MESSAGES.DUPLICATE_ENTRY,
        errorCode: ErrorCode.CONFLICT,
      }),
    );
  });

  it('should handle a foreign key violation database error', () => {
    const queryFailedError = new QueryFailedError('SELECT 1', [], {
      code: '23503',
      message: 'foreign key violation',
    } as any);

    filter.catch(queryFailedError, host);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: ERROR_MESSAGES.FOREIGN_KEY_VIOLATION,
        errorCode: ErrorCode.BAD_REQUEST,
      }),
    );
  });

  it('should handle unknown errors as internal server errors', () => {
    filter.catch(new Error('boom'), host);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
        errorCode: ErrorCode.INTERNAL_SERVER_ERROR,
      }),
    );
  });
});
