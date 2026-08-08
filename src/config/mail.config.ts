import { ConfigService } from '@nestjs/config';
import { MailConfig } from '../mail/interfaces/mail-options.interface';

/**
 * Reads and validates SMTP configuration from the environment.
 *
 * getOrThrow is used deliberately: the application must not start silently
 * with missing SMTP credentials, otherwise registration would create users
 * that can never receive a verification code.
 */
export const getMailConfig = (configService: ConfigService): MailConfig => {
  const port = Number(configService.getOrThrow<string>('MAIL_PORT'));

  if (Number.isNaN(port) || port <= 0) {
    throw new Error('MAIL_PORT must be a positive number');
  }

  return {
    host: configService.getOrThrow<string>('MAIL_HOST'),
    port,
    // Port 465 is implicit TLS; 587/25 use STARTTLS upgrade.
    secure: port === 465,
    user: configService.getOrThrow<string>('MAIL_USER'),
    password: configService.getOrThrow<string>('MAIL_PASSWORD'),
    from: configService.getOrThrow<string>('MAIL_FROM'),
  };
};
