/**
 * Fail-fast validation for required environment variables.
 *
 * Wired into ConfigModule.forRoot({ validate }) so the application refuses to
 * boot with missing SMTP credentials instead of only discovering the problem
 * when the first user tries to register.
 */
const REQUIRED_VARIABLES = [
  'JWT_SECRET',
  'MAIL_HOST',
  'MAIL_PORT',
  'MAIL_USER',
  'MAIL_PASSWORD',
  'MAIL_FROM',
  'OTP_EXPIRES_IN',
] as const;

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const missing = REQUIRED_VARIABLES.filter((key) => {
    const value = config[key];
    return (
      value === undefined ||
      value === null ||
      (typeof value === 'string' && value.trim().length === 0)
    );
  });

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
        'Check your .env file.',
    );
  }

  const mailPort = Number(config.MAIL_PORT);

  if (Number.isNaN(mailPort) || mailPort <= 0) {
    throw new Error('MAIL_PORT must be a positive number');
  }

  const otpExpiresIn = Number(config.OTP_EXPIRES_IN);

  if (Number.isNaN(otpExpiresIn) || otpExpiresIn <= 0) {
    throw new Error('OTP_EXPIRES_IN must be a positive number of seconds');
  }

  const otpLength = config.OTP_LENGTH;

  if (otpLength !== undefined && otpLength !== '') {
    const parsed = Number(otpLength);

    if (Number.isNaN(parsed) || parsed < 4 || parsed > 10) {
      throw new Error('OTP_LENGTH must be a number between 4 and 10');
    }
  }

  return config;
}
