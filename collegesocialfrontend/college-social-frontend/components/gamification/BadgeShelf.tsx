import { cn } from '@/lib/utils';
import { BADGE_META, type BadgeId } from '@/lib/types';

const ALL_BADGES = Object.keys(BADGE_META) as BadgeId[];

export function BadgeShelf({ badges }: { badges: string[] }) {
  return (
    <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
      {ALL_BADGES.map((id) => {
        const unlocked = badges.includes(id);
        const meta = BADGE_META[id];
        return (
          <div
            key={id}
            title={`${meta.label} — ${meta.description}`}
            className={cn(
              'flex flex-col items-center gap-1.5 rounded-2xl border p-3 text-center transition-transform hover:scale-105',
              unlocked
                ? 'border-gold/30 bg-gold/10 shadow-[0_0_20px_-8px_rgb(var(--gold)/0.6)]'
                : 'border-border bg-surface-2/70 opacity-50 grayscale',
            )}
          >
            <span className="text-xl">{meta.icon}</span>
            <span className={cn('text-[11px] font-medium leading-tight', unlocked ? 'text-gold' : 'text-muted-foreground')}>
              {meta.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
