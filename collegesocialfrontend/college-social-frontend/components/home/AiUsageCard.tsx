'use client';

import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { AiUsageMeter } from '@/components/ai/AiUsageMeter';
import { useAi } from '@/lib/ai-context';

// Thin shell around the already-4x-reused AiUsageMeter + a CTA -- reminds a student «رافد» exists
// and shows how much of today's quota is left. Self-fetching via useAi()'s context, zero props.
export function AiUsageCard() {
  const { usage } = useAi();
  if (!usage) return null;

  return (
    <Card className="flex items-center gap-4 p-4">
      <AiUsageMeter used={usage.used} limit={usage.limit} size={44} />
      <div className="min-w-0 flex-1">
        <SectionHeader icon={Sparkles} title="المساعد الذكي رافد" className="mb-1" />
        <p className="text-xs text-muted-foreground">
          {usage.remaining > 0 ? `تبقّى ${usage.remaining} من ${usage.limit} سؤال اليوم` : 'استنفدت أسئلة اليوم -- عد غدًا'}
        </p>
      </div>
      <Link
        href="/ai"
        className="shrink-0 rounded-lg border border-border bg-surface-2/50 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-accent/50 hover:text-accent"
      >
        اسأل الآن
      </Link>
    </Card>
  );
}
