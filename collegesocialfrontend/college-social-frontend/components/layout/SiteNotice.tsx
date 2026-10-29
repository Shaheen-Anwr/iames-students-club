'use client';

import { useState } from 'react';
import { AlertTriangle, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

// Site-wide notice shown above every page (the app and the sign-in screens). Set to null to take
// it down.
export const SITE_NOTICE: { title: string; body: string } | null = {
  title: 'تنبيه هام:',
  body: 'صور البروفايل وبعض ميزات التخزين متوقفة مؤقتاً لأسباب تقنية متعلقة بتجديد خدمات الكلاود التشغيلية. نود طمأنتكم بأن جميع بياناتكم وصوركم محفوظة وآمنة تماماً، وجاري العمل على استعادة كافة الميزات تدريجياً. شكراً لتفهمكم.',
};

// Part of the page flow, never overlaid, so the layout under it just starts lower instead of
// being covered. It sits on the top edge, so it also clears the status bar / notch of the
// installed PWA. Phones get one line that opens on tap; wider screens show the whole text.
export function SiteNotice() {
  const [expanded, setExpanded] = useState(false);
  if (!SITE_NOTICE) return null;

  return (
    <div
      role="note"
      aria-label="تنبيه"
      onClick={() => setExpanded((v) => !v)}
      className="shrink-0 cursor-pointer border-b border-warning/30 bg-warning-surface pt-[env(safe-area-inset-top)] text-foreground md:cursor-auto"
    >
      <div className="flex items-start gap-2 px-3 py-1.5 text-xs leading-relaxed md:px-4 md:text-[13px]">
        <AlertTriangle aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
        <p className={cn('min-w-0 flex-1', !expanded && 'line-clamp-1 md:line-clamp-none')}>
          <span className="font-semibold text-warning">{SITE_NOTICE.title}</span> {SITE_NOTICE.body}
        </p>
        {/* Toggled by the bar's onClick (the click bubbles up). */}
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={expanded ? 'إخفاء باقي التنبيه' : 'عرض التنبيه كاملاً'}
          className="-m-1 rounded-full p-1 text-muted-foreground md:hidden"
        >
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} />
        </button>
      </div>
    </div>
  );
}
