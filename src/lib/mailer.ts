import nodemailer from 'nodemailer';

export type MailPayload = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type MailerConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
};

export class Mailer {
  private readonly from: string;
  private readonly transport: nodemailer.Transporter | null = null;

  constructor(config?: MailerConfig | null) {
    this.from = config?.from ?? 'noreply@fd-edu.local';

    if (config?.host && config.user && config.password) {
      this.transport = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: {
          user: config.user,
          pass: config.password,
        },
      });
    }
  }

  get isConfigured() {
    return this.transport !== null;
  }

  async send(payload: MailPayload) {
    if (!this.transport) {
      return false;
    }

    await this.transport.sendMail({
      from: this.from,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    });

    return true;
  }
}
