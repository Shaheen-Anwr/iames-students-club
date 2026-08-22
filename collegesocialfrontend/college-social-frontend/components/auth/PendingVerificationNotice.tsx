import { MailWarning } from 'lucide-react';
import { cn } from '@/lib/utils';

// College email verification is admin-driven now (see AdminPanel's users table) rather than a
// self-serve code -- this just tells the student their account is in the queue.
export function PendingVerificationNotice({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning/10 px-3.5 py-3 text-sm text-warning',
        className,
      )}
    >
      <MailWarning className="mt-0.5 h-4 w-4 shrink-0" />
      <p>بريدك الجامعي بانتظار المراجعة من قبل الإدارة، وسيتم تفعيل حسابك بالكامل بعد التحقق منه.</p>
    </div>
  );
}
