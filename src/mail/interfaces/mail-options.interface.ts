export interface MailConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
}

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface MailHealthStatus {
  status: 'up' | 'down';
  error?: string;
}
