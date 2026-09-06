'use client';

import { useEffect, useState } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, LayoutGrid, Wand2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Switch } from '@/components/ui/Switch';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useRawQuery } from '@/lib/query';
import { useToast } from '@/lib/toast-context';
import { cn } from '@/lib/utils';
import { HOME_WIDGETS, type HomeLayoutPrefs, type WidgetId } from '@/lib/home-widgets';

// The persisted layout only ever names ids -- resolve them back to their registry entries (label,
// icon) for display here. Widgets restricted to the other role are left out entirely, same as
// getEffectiveOrder does for the actual /home render, so a student never sees "واجباتي المنشورة"
// in their own customize list (and vice versa for professors).
function widgetsForRole(role: string | undefined) {
  const r = role === 'professor' ? 'professor' : 'student';
  return HOME_WIDGETS.filter((w) => !w.restrictedTo || w.restrictedTo === r);
}

export function CustomizeHomeCard() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { data, isPending } = useRawQuery<HomeLayoutPrefs>(['home-layout'], '/users/me/home-layout');
  const [prefs, setPrefs] = useState<HomeLayoutPrefs | null>(null);

  const eligible = widgetsForRole(user?.role);

  useEffect(() => {
    if (!data) return;
    // Empty order (never customized) -- seed local state from the registry's own smart-ish
    // baseWeight order so the list has something sensible to show/drag before the user's first save.
    const order = data.order.length ? data.order : [...eligible].sort((a, b) => b.baseWeight - a.baseWeight).map((w) => w.id);
    setPrefs({ order, hidden: data.hidden });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function save(patch: Partial<HomeLayoutPrefs>) {
    if (!prefs) return;
    const prev = prefs;
    const next = { ...prefs, ...patch };
    setPrefs(next);
    try {
      await api.patch<HomeLayoutPrefs>('/users/me/home-layout', patch);
    } catch {
      setPrefs(prev); // roll back
      showToast('تعذّر حفظ ترتيب الرئيسية.', 'error');
    }
  }

  function handleDragEnd(e: DragEndEvent) {
    if (!prefs) return;
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = prefs.order.indexOf(active.id as WidgetId);
    const newIndex = prefs.order.indexOf(over.id as WidgetId);
    if (oldIndex === -1 || newIndex === -1) return;
    save({ order: arrayMove(prefs.order, oldIndex, newIndex) });
  }

  function toggleHidden(id: WidgetId, visible: boolean) {
    if (!prefs) return;
    const set = new Set(prefs.hidden);
    if (visible) set.delete(id);
    else set.add(id);
    save({ hidden: [...set] });
  }

  function resetToSmart() {
    save({ order: [] });
  }

  // Order rows by the saved order, then append any eligible widget missing from it (newly added
  // since the user last saved, or their role just changed) -- mirrors getEffectiveOrder's own
  // "append missing" fallback so this list never silently drops a widget.
  const orderedRows = (() => {
    if (!prefs) return [];
    const byId = new Map(eligible.map((w) => [w.id, w]));
    const seen = new Set<WidgetId>();
    const rows = [];
    for (const id of prefs.order) {
      const w = byId.get(id);
      if (w && !seen.has(id)) {
        rows.push(w);
        seen.add(id);
      }
    }
    for (const w of eligible) {
      if (!seen.has(w.id)) rows.push(w);
    }
    return rows;
  })();

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-start justify-between gap-2.5">
        <div className="flex items-start gap-2.5">
          <LayoutGrid className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">تخصيص الرئيسية</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">اسحب لإعادة الترتيب، وأخفِ ما لا يهمّك.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={resetToSmart}
          className="flex shrink-0 items-center gap-1 rounded-lg border border-border bg-surface-2/50 px-2.5 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:border-accent/50 hover:text-accent"
        >
          <Wand2 className="h-3 w-3" />
          إعادة الترتيب الذكي
        </button>
      </div>

      {isPending || !prefs ? (
        <LayoutGrid className="h-4 w-4 animate-pulse text-muted-foreground" />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={orderedRows.map((w) => w.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-1">
              {orderedRows.map((w) => (
                <WidgetRow key={w.id} widget={w} visible={!prefs.hidden.includes(w.id)} onVisibleChange={(v) => toggleHidden(w.id, v)} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </Card>
  );
}

function WidgetRow({
  widget,
  visible,
  onVisibleChange,
}: {
  widget: (typeof HOME_WIDGETS)[number];
  visible: boolean;
  onVisibleChange: (visible: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: widget.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const Icon = widget.icon;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex touch-none items-center gap-3 rounded-xl2 border border-border/60 bg-surface-2/40 px-3 py-2.5',
        isDragging && 'z-10 opacity-70 shadow-elev-3',
        !visible && 'opacity-50',
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="flex h-7 w-7 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <p className="min-w-0 flex-1 truncate text-sm text-foreground">{widget.label}</p>
      <Switch checked={visible} onCheckedChange={onVisibleChange} aria-label={widget.label} />
    </div>
  );
}
