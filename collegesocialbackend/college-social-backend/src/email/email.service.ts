import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

const APP_NAME = 'IEAMS Students Club';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: nodemailer.Transporter | null;
  private readonly fromAddress: string | null;

  // Plain SMTP -- works with any provider (Brevo, Mailtrap, Gmail, a self-hosted relay, ...),
  // no code changes needed to switch. Recommended: Brevo's free tier (app.brevo.com), since unlike
  // a transactional provider requiring a verified domain (Resend/SendGrid) or Gmail's app-password
  // flow (needs 2-Step Verification, not available on every account), it only needs "single sender"
  // verification -- a one-click confirmation link emailed to the sending address. See .env.example.
  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('smtp.host') ?? '';
    const user = this.config.get<string>('smtp.user') ?? '';
    const pass = this.config.get<string>('smtp.pass') ?? '';
    const port = this.config.get<number>('smtp.port') ?? 587;
    this.fromAddress = this.config.get<string>('smtp.fromEmail') || user || null;

    if (!host || !user || !pass) {
      this.logger.warn('SMTP_HOST/SMTP_USER/SMTP_PASS not set -- emails will be logged instead of sent.');
      this.transporter = null;
    } else {
      this.transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
    }
  }

  // Never throws -- a failed send shouldn't fail registration; the user can hit
  // "resend verification" later. Logs a warning instead.
  async sendVerificationEmail(to: string, name: string, code: string): Promise<void> {
    await this.send(to, `${code} هو رمز التحقق الخاص بك`, this.codeEmailHtml(name, code, 'تأكيد بريدك الجامعي', '15 دقيقة'));
  }

  // Never throws, same reasoning as sendVerificationEmail -- a failed send shouldn't fail the
  // forgot-password request (which returns a generic success either way, see AuthService).
  async sendPasswordResetEmail(to: string, name: string, code: string): Promise<void> {
    await this.send(
      to,
      `${code} هو رمز إعادة تعيين كلمة المرور`,
      this.codeEmailHtml(
        name,
        code,
        'إعادة تعيين كلمة المرور الخاصة بحسابك',
        '10 دقائق',
        'إذا لم تطلب إعادة تعيين كلمة المرور، تجاهل هذه الرسالة -- حسابك آمن ولن يتغيّر شيء.',
      ),
    );
  }

  private async send(to: string, subject: string, html: string): Promise<void> {
    if (!this.transporter || !this.fromAddress) {
      this.logger.warn(`SMTP not configured -- skipping "${subject}" to ${to}`);
      return;
    }

    try {
      await this.transporter.sendMail({ from: `${APP_NAME} <${this.fromAddress}>`, to, subject, html });
      this.logger.log(`Sent "${subject}" to ${to}`);
    } catch (err) {
      this.logger.warn(`Failed to send email to ${to}: ${err instanceof Error ? err.message : err}`);
    }
  }

  private codeEmailHtml(name: string, code: string, action: string, ttl: string, footnote?: string): string {
    return `
      <div dir="rtl" style="font-family: Tahoma, Arial, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>مرحبًا ${name}،</h2>
        <p>استخدم الرمز التالي لـ${action}. صالح لمدة ${ttl}.</p>
        <p style="text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 8px; background: #eef2f7; color: #1d3557; padding: 16px; border-radius: 12px; margin: 20px 0;">
          ${code}
        </p>
        <p style="color: #64748b; font-size: 13px;">${footnote ?? 'إذا لم تُنشئ هذا الحساب، يمكنك تجاهل هذه الرسالة.'}</p>
      </div>
    `;
  }
}
