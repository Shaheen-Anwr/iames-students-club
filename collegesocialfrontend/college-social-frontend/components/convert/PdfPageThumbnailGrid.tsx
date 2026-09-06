'use client';

import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CheckSquare, GripVertical, Minus, Plus, RotateCw, Square } from 'lucide-react';
import { stagedThumbUrl } from '@/lib/api';
import { cn } from '@/lib/utils';

// One entry per page of the staged PDF, addressed by its ORIGINAL (pre-reorder) page index -- the
// thumbnail URL is always keyed by originalIndex since that's what the backend rendered from.
export interface PageItem {
  id: string; // stable across reorders, e.g. `p${originalIndex}`
  originalIndex: number;
  rotation: number; // cumulative delta, 0/90/180/270
  selected: boolean; // 'pages' mode: this page is in the toggled set
  group: number; // 'split' mode: 1-based output-file number
}

export function initialPages(pageCount: number): PageItem[] {
  return Array.from({ length: pageCount }, (_, i) => ({ id: `p${i}`, originalIndex: i, rotation: 0, selected: false, group: 1 }));
}

type Mode = 'reorder' | 'rotate' | 'pages' | 'split';

export function PdfPageThumbnailGrid({
  stagedId,
  pages,
  mode,
  onChange,
}: {
  stagedId: string;
  pages: PageItem[];
  mode: Mode;
  onChange: (pages: PageItem[]) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = pages.findIndex((p) => p.id === active.id);
    const newIndex = pages.findIndex((p) => p.id === over.id);
    onChange(arrayMove(pages, oldIndex, newIndex));
  }

  const patch = (id: string, p: Partial<PageItem>) => onChange(pages.map((it) => (it.id === id ? { ...it, ...p } : it)));

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={mode === 'reorder' ? handleDragEnd : undefined}>
      <SortableContext items={pages.map((p) => p.id)} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
          {pages.map((p, i) => (
            <PdfPageThumbnail
              key={p.id}
              stagedId={stagedId}
              page={p}
              displayIndex={i}
              mode={mode}
              onRotate={() => patch(p.id, { rotation: (p.rotation + 90) % 360 })}
              onToggleSelect={() => patch(p.id, { selected: !p.selected })}
              onGroupChange={(delta) => patch(p.id, { group: Math.max(1, p.group + delta) })}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function PdfPageThumbnail({
  stagedId,
  page,
  displayIndex,
  mode,
  onRotate,
  onToggleSelect,
  onGroupChange,
}: {
  stagedId: string;
  page: PageItem;
  displayIndex: number;
  mode: Mode;
  onRotate: () => void;
  onToggleSelect: () => void;
  onGroupChange: (delta: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id, disabled: mode !== 'reorder' });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group relative aspect-[3/4] touch-none overflow-hidden rounded-xl2 border border-border bg-surface-2',
        isDragging && 'z-10 opacity-70 shadow-elev-3',
        mode === 'pages' && page.selected && 'ring-2 ring-accent',
      )}
    >
      <img
        src={stagedThumbUrl(stagedId, page.originalIndex)}
        alt={`صفحة ${displayIndex + 1}`}
        loading="lazy"
        style={{ transform: `rotate(${page.rotation}deg)` }}
        className="h-full w-full object-contain transition-transform"
      />
      <span className="absolute bottom-1 start-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">{displayIndex + 1}</span>

      {mode === 'reorder' && (
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="absolute top-1 end-1 flex h-7 w-7 cursor-grab items-center justify-center rounded-full bg-black/60 text-white active:cursor-grabbing"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      )}

      {mode === 'rotate' && (
        <button
          type="button"
          onClick={onRotate}
          className="absolute top-1 end-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        >
          <RotateCw className="h-3.5 w-3.5" />
        </button>
      )}

      {mode === 'pages' && (
        <button type="button" onClick={onToggleSelect} className="absolute inset-0 flex items-start justify-end p-1">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white">
            {page.selected ? <CheckSquare className="h-4 w-4 text-accent" /> : <Square className="h-4 w-4" />}
          </span>
        </button>
      )}

      {mode === 'split' && (
        <div className="absolute top-1 end-1 flex items-center gap-0.5 rounded-full bg-black/60 px-1 py-0.5 text-white">
          <button type="button" onClick={() => onGroupChange(-1)} className="flex h-5 w-5 items-center justify-center">
            <Minus className="h-3 w-3" />
          </button>
          <span className="min-w-[1rem] text-center text-[11px] font-medium">{page.group}</span>
          <button type="button" onClick={() => onGroupChange(1)} className="flex h-5 w-5 items-center justify-center">
            <Plus className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}
