'use client';

import { useState } from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { ArrowUpDown, Check, Clock, Flame, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/lib/use-media-query';
import { Sheet } from '@/components/ui/Sheet';

export type SortMode = 'latest' | 'engaged' | 'department' | 'academicYear' | 'specialization';

type SortOption = { value: SortMode; label: string; icon: React.ComponentType<{ className?: string }> };

// Two distinct jobs the old flat <select> blurred together: "latest / most engaged" actually
// re-orders the list, while "by department / year / specialization" just clusters it in the
// catalog's fixed order. Splitting them into labelled sections makes that obvious.
const REORDER: SortOption[] = [
  { value: 'latest', label: 'الأحدث', icon: Clock },
  { value: 'engaged', label: 'الأكثر تفاعلاً', icon: Flame },
];
const GROUPING: SortOption[] = [
  { value: 'department', label: 'حسب الشعبة', icon: Layers },
  { value: 'academicYear', label: 'حسب السنة الدراسية', icon: Layers },
  { value: 'specialization', label: 'حسب التخصص', icon: Layers },
];

export const SORT_LABELS: Record<SortMode, string> = Object.fromEntries(
  [...REORDER, ...GROUPING].map((o) => [o.value, o.label]),
) as Record<SortMode, string>;

const SCOPE_NOTE = 'يُطبَّق على المنشورات المحمّلة حاليًا فقط، وليس على كل المنشورات.';

function Trigger({ value }: { value: SortMode }) {
  return (
    <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface-2 ps-2.5 pe-2 text-xs font-medium text-foreground transition-colors hover:bg-surface-3">
      <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
      {SORT_LABELS[value]}
    </span>
  );
}

// Sort / group selector for the feed. Desktop: an anchored Radix radio menu (arrow-key + ESC
// support, collision-aware). Phones: a bottom sheet with finger-sized radio rows. Both carry a
// footer note that the sort only touches posts already loaded.
export function SortMenu({ value, onChange }: { value: SortMode; onChange: (mode: SortMode) => void }) {
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);

  if (isMobile) {
    return (
      <>
        <button type="button" onClick={() => setSheetOpen(true)} className="inline-flex shrink-0">
          <Trigger value={value} />
        </button>
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen} title="ترتيب المنشورات">
          <div className="flex flex-col gap-4">
            <SheetSection heading="ترتيب" options={REORDER} value={value} onPick={(v) => { setSheetOpen(false); onChange(v); }} />
            <SheetSection heading="تجميع" options={GROUPING} value={value} onPick={(v) => { setSheetOpen(false); onChange(v); }} />
            <p className="border-t border-border pt-3 text-[11px] leading-relaxed text-muted-foreground">{SCOPE_NOTE}</p>
          </div>
        </Sheet>
      </>
    );
  }

  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        <button type="button" className="inline-flex shrink-0 outline-none">
          <Trigger value={value} />
        </button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="end"
          sideOffset={6}
          collisionPadding={8}
          className="glass z-50 min-w-[13rem] rounded-xl p-1 shadow-elev-3 data-[state=open]:animate-scale-in"
        >
          <Menu.RadioGroup value={value} onValueChange={(v) => onChange(v as SortMode)}>
            <MenuSection heading="ترتيب" options={REORDER} />
            <Menu.Separator className="my-1 h-px bg-border" />
            <MenuSection heading="تجميع" options={GROUPING} />
          </Menu.RadioGroup>
          <p className="mt-1 border-t border-border px-3 pb-1 pt-2 text-[11px] leading-relaxed text-muted-foreground">
            {SCOPE_NOTE}
          </p>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

function MenuSection({ heading, options }: { heading: string; options: SortOption[] }) {
  return (
    <>
      <Menu.Label className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {heading}
      </Menu.Label>
      {options.map(({ value, label, icon: Icon }) => (
        <Menu.RadioItem
          key={value}
          value={value}
          className={cn(
            'flex cursor-pointer select-none items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium outline-none transition-colors',
            'data-[highlighted]:bg-surface-2 data-[state=checked]:text-accent',
          )}
        >
          <Icon className="h-4 w-4 shrink-0" />
          {label}
          <span className="ms-auto flex h-4 w-4 items-center justify-center">
            <Menu.ItemIndicator>
              <Check className="h-4 w-4" />
            </Menu.ItemIndicator>
          </span>
        </Menu.RadioItem>
      ))}
    </>
  );
}

function SheetSection({
  heading,
  options,
  value,
  onPick,
}: {
  heading: string;
  options: SortOption[];
  value: SortMode;
  onPick: (mode: SortMode) => void;
}) {
  return (
    <div>
      <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{heading}</p>
      <div className="flex flex-col">
        {options.map(({ value: v, label, icon: Icon }) => {
          const selected = v === value;
          return (
            <button
              key={v}
              type="button"
              onClick={() => onPick(v)}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-3.5 text-start text-[15px] font-medium transition-colors',
                selected ? 'text-accent' : 'text-foreground active:bg-surface-2',
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {label}
              {selected && <Check className="ms-auto h-5 w-5" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
