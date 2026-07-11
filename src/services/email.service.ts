import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env.js';
import { ApiError } from '../lib/errors.js';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

let transporter: Transporter | undefined;

export function isEmailConfigured(): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}

export function requireEmailConfigured(): void {
  if (!isEmailConfigured()) {
    throw new ApiError(503, 'EMAIL_NOT_CONFIGURED', 'Recipient email notifications require SMTP_HOST, SMTP_USER, and SMTP_PASS to be configured.');
  }
}

function getTransporter(): Transporter {
  requireEmailConfigured();
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS
      }
    });
  }
  return transporter;
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  await getTransporter().sendMail({
    from: { name: env.EMAIL_FROM_NAME, address: env.EMAIL_FROM_ADDRESS },
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html
  });
}
