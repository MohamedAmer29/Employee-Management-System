import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Transporter } from 'nodemailer';
import { MAIL_SUBJECTS, MAIL_TRANSPORTER } from './mail.constants';
import {
  MailHealthStatus,
  SendMailOptions,
} from './interfaces/mail-options.interface';
import {
  buildEmailVerificationHtml,
  buildEmailVerificationText,
} from './templates/email-verification.template';
import { getMailConfig } from '../config/mail.config';

/**
 * Thin, reusable wrapper around a single pooled Nodemailer transporter.
 *
 * The transporter is created once by MailModule and injected here, so no new
 * SMTP connection is opened per email. Raw SMTP errors are logged server-side
 * and never propagated to the caller verbatim.
 */
@Injectable()
export class MailService implements OnModuleDestroy {
  private readonly logger = new Logger(MailService.name);
  private readonly from: string;

  constructor(
    @Inject(MAIL_TRANSPORTER) private readonly transporter: Transporter,
    private readonly configService: ConfigService,
  ) {
    this.from = getMailConfig(this.configService).from;
  }

  /**
   * Sends the email-verification OTP.
   *
   * Throws on failure so the caller can roll back the stored OTP. The OTP value
   * itself is never written to the logs.
   */
  async sendEmailVerificationOtp(
    email: string,
    otp: string,
    expiresInMinutes: number,
    recipientName?: string,
  ): Promise<void> {
    const templateData = { otp, expiresInMinutes, recipientName };

    await this.send({
      to: email,
      subject: MAIL_SUBJECTS.EMAIL_VERIFICATION,
      html: buildEmailVerificationHtml(templateData),
      text: buildEmailVerificationText(templateData),
    });
  }

  private async send(options: SendMailOptions): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      });

      this.logger.log(`Email "${options.subject}" sent to ${options.to}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown SMTP error';

      // Technical detail stays on the server; the caller maps this to a
      // generic EMAIL_SEND_FAILED response.
      this.logger.error(
        `Failed to send "${options.subject}" to ${options.to}: ${message}`,
      );

      throw error instanceof Error ? error : new Error(message);
    }
  }

  async verifyConnection(): Promise<MailHealthStatus> {
    try {
      await this.transporter.verify();
      return { status: 'up' };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown SMTP error';
      this.logger.warn(`SMTP verification failed: ${message}`);
      return { status: 'down', error: message };
    }
  }

  onModuleDestroy(): void {
    this.transporter.close();
    this.logger.log('SMTP transporter closed');
  }
}
