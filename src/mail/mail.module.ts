import { Global, Logger, Module, Provider } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import { MAIL_DEFAULTS, MAIL_TRANSPORTER } from './mail.constants';
import { MailService } from './mail.service';
import { getMailConfig } from '../config/mail.config';

/**
 * Creates one pooled SMTP transporter for the whole application lifetime.
 * Pooling keeps a small set of connections warm instead of performing a full
 * SMTP handshake for every verification email.
 */
const mailTransporterProvider: Provider = {
  provide: MAIL_TRANSPORTER,
  inject: [ConfigService],
  useFactory: (configService: ConfigService): Transporter => {
    const logger = new Logger('MailTransporter');
    const config = getMailConfig(configService);

    const transporter = createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.password,
      },
      pool: true,
      maxConnections: MAIL_DEFAULTS.POOL_MAX_CONNECTIONS,
      maxMessages: MAIL_DEFAULTS.POOL_MAX_MESSAGES,
      connectionTimeout: MAIL_DEFAULTS.CONNECTION_TIMEOUT_MS,
      greetingTimeout: MAIL_DEFAULTS.GREETING_TIMEOUT_MS,
      socketTimeout: MAIL_DEFAULTS.SOCKET_TIMEOUT_MS,
    });

    logger.log(
      `SMTP transporter configured for ${config.host}:${config.port} (secure: ${config.secure})`,
    );

    return transporter;
  },
};

@Global()
@Module({
  imports: [ConfigModule],
  providers: [mailTransporterProvider, MailService],
  exports: [MailService],
})
export class MailModule {}
