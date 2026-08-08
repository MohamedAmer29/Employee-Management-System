import { HttpStatus } from '@nestjs/common';
import { AppException } from './app.exception';
import { ErrorCode } from './error-code.enum';
import { ERROR_MESSAGES } from '../constants/error-messages';

/**
 * Email verification / OTP exceptions.
 *
 * All of these extend the existing AppException so they flow through the
 * project's AllExceptionsFilter unchanged and produce the standard
 * { success, statusCode, message, errorCode, timestamp, path } envelope.
 */

export class EmailNotVerifiedException extends AppException {
  constructor(message: string = ERROR_MESSAGES.EMAIL_NOT_VERIFIED) {
    super(message, HttpStatus.FORBIDDEN, ErrorCode.EMAIL_NOT_VERIFIED);
  }
}

export class EmailAlreadyVerifiedException extends AppException {
  constructor(message: string = ERROR_MESSAGES.EMAIL_ALREADY_VERIFIED) {
    super(message, HttpStatus.BAD_REQUEST, ErrorCode.EMAIL_ALREADY_VERIFIED);
  }
}

export class InvalidOtpException extends AppException {
  constructor(message: string = ERROR_MESSAGES.INVALID_OTP) {
    super(message, HttpStatus.BAD_REQUEST, ErrorCode.INVALID_OTP);
  }
}

export class OtpExpiredException extends AppException {
  constructor(message: string = ERROR_MESSAGES.OTP_EXPIRED) {
    super(message, HttpStatus.BAD_REQUEST, ErrorCode.OTP_EXPIRED);
  }
}

export class OtpTooManyAttemptsException extends AppException {
  constructor(message: string = ERROR_MESSAGES.OTP_TOO_MANY_ATTEMPTS) {
    super(
      message,
      HttpStatus.TOO_MANY_REQUESTS,
      ErrorCode.OTP_TOO_MANY_ATTEMPTS,
    );
  }
}

export class EmailSendFailedException extends AppException {
  constructor(message: string = ERROR_MESSAGES.EMAIL_SEND_FAILED) {
    super(
      message,
      HttpStatus.INTERNAL_SERVER_ERROR,
      ErrorCode.EMAIL_SEND_FAILED,
    );
  }
}
