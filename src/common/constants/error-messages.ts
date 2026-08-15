export const ERROR_MESSAGES = {
  // General
  INTERNAL_SERVER_ERROR: 'Internal server error',
  BAD_REQUEST: 'Invalid request',
  UNAUTHORIZED: 'Authentication required',
  FORBIDDEN: 'You do not have permission to perform this action',
  NOT_FOUND: 'Resource not found',
  CONFLICT: 'Resource already exists',
  VALIDATION_FAILED: 'Validation failed',
  RATE_LIMIT_EXCEEDED: 'Too many requests. Please try again later.',

  // Authentication
  INVALID_CREDENTIALS: 'Invalid email or password',
  INVALID_TOKEN: 'Invalid or expired authentication token',
  TOKEN_EXPIRED: 'Authentication token has expired',
  MISSING_TOKEN: 'Authentication token is required',
  SESSION_EXPIRED: 'Your session has expired. Please login again',

  // Email verification / OTP
  EMAIL_NOT_VERIFIED: 'Please verify your email before logging in',
  EMAIL_ALREADY_VERIFIED: 'Email is already verified',
  INVALID_OTP: 'Invalid verification code',
  OTP_EXPIRED: 'Verification code has expired',
  OTP_TOO_MANY_ATTEMPTS:
    'Too many invalid attempts. Please request a new verification code.',
  OTP_RATE_LIMIT_EXCEEDED:
    'Too many verification requests. Please try again later.',
  EMAIL_SEND_FAILED: 'Unable to send verification email',
  VERIFICATION_EMAIL_SENT: 'Verification code sent successfully',
  VERIFICATION_EMAIL_SENT_GENERIC:
    'If the account exists, a verification email has been sent.',
  EMAIL_VERIFIED: 'Email verified successfully',

  // User
  USER_NOT_FOUND: 'User not found',
  USER_ALREADY_EXISTS: 'User with this username already exists',
  USER_INACTIVE: 'User account is inactive',

  // Employee
  EMPLOYEE_NOT_FOUND: 'Employee not found',
  EMPLOYEE_EMAIL_NOT_FOUND: 'No employee found with the provided email',
  EMPLOYEE_ALREADY_EXISTS: 'Employee with this email already exists',
  EMPLOYEE_HAS_USER: 'Employee already has a user account assigned',
  EMPLOYEE_NO_USER: 'Employee does not have a user account',
  EMPLOYEE_ROLE_MISMATCH: 'User role must match the employee role',

  // Department
  DEPARTMENT_NOT_FOUND: 'Department not found',
  DEPARTMENT_HAS_EMPLOYEES: 'Cannot delete a department that has employees',
  DEPARTMENT_ALREADY_EXISTS: 'Department with this name already exists',

  // Attendance
  ATTENDANCE_NOT_FOUND: 'Attendance record not found',
  ATTENDANCE_ALREADY_CHECKED_IN: 'Employee has already checked in today',
  ATTENDANCE_ALREADY_CHECKED_OUT: 'Employee has already checked out today',
  ATTENDANCE_NOT_CHECKED_IN: 'Employee has not checked in today',
  INVALID_ATTENDANCE_DATE: 'Invalid attendance date',

  // Leave
  LEAVE_NOT_FOUND: 'Leave request not found',
  LEAVE_ALREADY_PROCESSED: 'This leave request has already been processed',
  LEAVE_INVALID_DATES: 'Leave end date cannot be before start date',
  LEAVE_INSUFFICIENT_BALANCE: 'Insufficient leave balance',
  LEAVE_DUPLICATE: 'Duplicate leave request for the same dates',
  LEAVE_OVERLAPPING: 'Leave request overlaps with an existing leave',

  // Performance
  PERFORMANCE_NOT_FOUND: 'Performance review not found',
  PERFORMANCE_ALREADY_EXISTS:
    'Performance review already exists for this period',

  // Notification
  NOTIFICATION_NOT_FOUND: 'Notification not found',

  // Audit Log
  AUDIT_LOG_NOT_FOUND: 'Audit log not found',

  // Database
  DATABASE_ERROR: 'A database error occurred',
  DATABASE_CONNECTION_ERROR: 'Unable to connect to the database',
  FOREIGN_KEY_VIOLATION:
    'This operation violates a related resource constraint',
  DUPLICATE_ENTRY: 'A record with this value already exists',

  // File Upload
  INVALID_FILE_TYPE: 'Invalid file type',
  FILE_TOO_LARGE: 'File size exceeds the maximum allowed size',
  FILE_UPLOAD_FAILED: 'Failed to upload file',
};
