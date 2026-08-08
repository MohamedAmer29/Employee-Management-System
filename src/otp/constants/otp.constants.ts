export const OTP_DEFAULTS = {
  LENGTH: 6,
  EXPIRES_IN_SECONDS: 300,
  MAX_FAILED_ATTEMPTS: 5,
  MAX_RESEND_REQUESTS: 3,
  RESEND_WINDOW_SECONDS: 900,
} as const;

/**
 * Redis key builders for the email-verification OTP flow.
 *
 * Every builder normalises the email first so "User@Example.com" and
 * "user@example.com" always resolve to the same key.
 */
export const normalizeEmail = (email: string): string =>
  email.toLowerCase().trim();

export const OtpKeys = {
  otp: (email: string): string =>
    `email-verification-otp:${normalizeEmail(email)}`,
  attempts: (email: string): string =>
    `email-verification-attempts:${normalizeEmail(email)}`,
  rate: (email: string): string =>
    `email-verification-rate:${normalizeEmail(email)}`,
} as const;
