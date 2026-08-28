import { StreakPointsPill } from '@/components/gamification/StreakPointsPill';
import type { User } from '@/lib/types';

function greetingForNow(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'صباح الخير';
  if (hour < 17) return 'أهلًا بعودتك';
  return 'مساء الخير';
}

export function GreetingHeader({ user }: { user: User }) {
  const firstName = user.name.trim().split(/\s+/)[0];
  const subtitle = user.role === 'professor' ? 'هذه لمحة سريعة عن نشاطك التدريسي اليوم.' : 'هذه لمحة سريعة عن يومك الدراسي.';
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-surface px-4 py-4 shadow-elev-1 sm:px-5 sm:py-5">
      {/* Soft accent wash -- the one "hero" moment on an otherwise dense dashboard. */}
      <div aria-hidden className="bg-mesh pointer-events-none absolute inset-0 opacity-60" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            {greetingForNow()}، {firstName} 👋
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <StreakPointsPill user={user} size="lg" className="sm:max-w-sm" />
      </div>
    </div>
  );
}
