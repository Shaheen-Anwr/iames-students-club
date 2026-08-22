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
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold text-foreground sm:text-2xl">
          {greetingForNow()}، {firstName} 👋
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">هذه لمحة سريعة عن يومك الدراسي.</p>
      </div>
      <StreakPointsPill user={user} size="lg" className="sm:max-w-sm" />
    </div>
  );
}
