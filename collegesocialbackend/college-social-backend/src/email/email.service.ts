import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend | null;
  private readonly fromEmail: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('resend.apiKey');
    this.resend = apiKey ? new Resend(apiKey) : null;
    this.fromEmail = this.config.get<string>('resend.fromEmail') ?? 'onboarding@resend.dev';
  }

  // Never throws -- a failed send shouldn't fail registration; the user can hit
  // "resend verification" later. Logs a warning instead.
  async sendVerificationEmail(to: string, name: string, code: string): Promise<void> {
    if (!this.resend) {
      this.logger.warn(`RESEND_API_KEY not set -- skipping verification email to ${to}. Code: ${code}`);
      return;
    }

    try {
      await this.resend.emails.send({
        from: this.fromEmail,
        to,
        subject: `${code} هو رمز التحقق الخاص بك`,
        html: `
          <div dir="rtl" style="font-family: Tahoma, Arial, sans-serif; max-width: 480px; margin: 0 auto;">
            <h2>مرحبًا ${name}،</h2>
            <p>استخدم الرمز التالي لتأكيد بريدك الجامعي. صالح لمدة 15 دقيقة.</p>
            <p style="text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 8px; background: #eef2f7; color: #1d3557; padding: 16px; border-radius: 12px; margin: 20px 0;">
              ${code}
            </p>
            <p style="color: #64748b; font-size: 13px;">إذا لم تُنشئ هذا الحساب، يمكنك تجاهل هذه الرسالة.</p>
          </div>
        `,
      });
    } catch (err) {
      this.logger.warn(`Failed to send verification email to ${to}: ${err instanceof Error ? err.message : err}`);
    }
  }
}
