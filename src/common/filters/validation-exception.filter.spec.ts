import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ValidationExceptionFilter } from './validation-exception.filter';
import { ErrorCode } from '../exceptions/error-code.enum';

describe('ValidationExceptionFilter', () => {
  let filter: ValidationExceptionFilter;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;
  let host: any;

  beforeEach(() => {
    filter = new ValidationExceptionFilter();
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

  it('should format and return validation errors for a bad request', () => {
    const exception = new BadRequestException({
      message: [
        {
          property: 'username',
          constraints: { isString: 'username must be a string' },
        },
      ],
    });

    filter.catch(exception, host);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Validation failed',
        errorCode: ErrorCode.VALIDATION_ERROR,
        errors: [
          { field: 'username', messages: ['username must be a string'] },
        ],
      }),
    );
  });

  it('should rethrow non-validation HttpExceptions', () => {
    const exception = new BadRequestException('plain bad request message');

    expect(() => filter.catch(exception, host)).toThrow(HttpException);
    expect(jsonMock).not.toHaveBeenCalled();
  });

  it('should rethrow non-HttpExceptions', () => {
    expect(() => filter.catch(new Error('boom'), host)).toThrow(Error);
    expect(jsonMock).not.toHaveBeenCalled();
  });

  it('should format nested validation errors', () => {
    const exception = new BadRequestException({
      message: [
        {
          property: 'user',
          constraints: { isDefined: 'user should not be empty' },
          children: [
            {
              property: 'name',
              constraints: { isString: 'name must be a string' },
            },
          ],
        },
      ],
    });

    filter.catch(exception, host);

    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        errors: [
          { field: 'user', messages: ['user should not be empty'] },
          { field: 'user.name', messages: ['name must be a string'] },
        ],
      }),
    );
  });
});
