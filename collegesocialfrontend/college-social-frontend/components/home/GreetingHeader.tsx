import Link from 'next/link';
import { AlertTriangle, Bell, Clock3, Flame, Sparkles } from 'lucide-react';
import { StreakPointsPill } from '@/components/gamification/StreakPointsPill';
import { cn } from '@/lib/utils';
import type { Nudge, NudgeIcon } from '@/lib/today';
import type { User } from '@/lib/types';

function greetingForNow(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'صباح الخير';
  if (hour < 17) return 'أهلًا بعودتك';
  return 'مساء الخير';
}

const NUDGE_ICON: Record<NudgeIcon, typeof Bell> = {
  alert: AlertTriangle,
  clock: Clock3,
  bell: Bell,
  sparkles: Sparkles,
  flame: Flame,
};

const NUDGE_TONE: Record<Nudge['tone'], string> = {
  danger: 'bg-danger/10 text-danger ring-danger/20',
  warning: 'bg-warning/10 text-warning ring-warning/20',
  accent: 'bg-accent/10 text-accent ring-accent/20',
  success: 'bg-success/10 text-success ring-success/20',
};

export function GreetingHeader({ user, nudge }: { user: User; nudge?: Nudge | null }) {
  const firstName = user.name.trim().split(/\s+/)[0];
  const subtitle =
    user.role === 'professor' ? 'هذه لمحة سريعة عن نشاطك التدريسي اليوم.' : 'هذه لمحة سريعة عن يومك الدراسي.';
  const NudgeIconCmp = nudge ? NUDGE_ICON[nudge.icon] : null;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-surface px-4 py-4 shadow-elev-1 sm:px-5 sm:py-5">
      {/* Soft accent wash -- the one "hero" moment on an otherwise dense dashboard. */}
      <div aria-hidden className="bg-mesh pointer-events-none absolute inset-0 opacity-60" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            {greetingForNow()}، {firstName} 👋
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          {nudge && NudgeIconCmp && (
            <Link
              href={nudge.href}
              className={cn(
                'mt-2.5 inline-flex max-w-full items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition-transform active:scale-[0.98]',
                NUDGE_TONE[nudge.tone],
              )}
            >
              <NudgeIconCmp className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{nudge.text}</span>
            </Link>
          )}
        </div>
        <StreakPointsPill user={user} size="lg" className="sm:max-w-sm" />
      </div>
    </div>
  );
}
