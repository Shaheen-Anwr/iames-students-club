'use client';

import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FileIcon, GripVertical, X } from 'lucide-react';
import { formatBytes } from '@/lib/convert-format';
import { cn } from '@/lib/utils';

export interface OrderedFile {
  id: string;
  file: File;
}

// Whole-FILE drag-reorder (merge / images-to-pdf) -- unlike PdfPageThumbnailGrid, these files are
// already sitting in browser memory (just picked), so there's no server staging/thumbnail step.
export function FileOrderGrid({
  items,
  onChange,
  previewAsImage = false,
}: {
  items: OrderedFile[];
  onChange: (items: OrderedFile[]) => void;
  previewAsImage?: boolean;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((it) => it.id === active.id);
    const newIndex = items.findIndex((it) => it.id === over.id);
    onChange(arrayMove(items, oldIndex, newIndex));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((it) => it.id)} strategy={rectSortingStrategy}>
        <div className={cn('grid gap-3', previewAsImage ? 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5' : 'grid-cols-1')}>
          {items.map((it, i) => (
            <FileOrderCard
              key={it.id}
              item={it}
              index={i}
              previewAsImage={previewAsImage}
              onRemove={() => onChange(items.filter((x) => x.id !== it.id))}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function FileOrderCard({
  item,
  index,
  previewAsImage,
  onRemove,
}: {
  item: OrderedFile;
  index: number;
  previewAsImage: boolean;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  if (previewAsImage) {
    const url = URL.createObjectURL(item.file);
    return (
      <div
        ref={setNodeRef}
        style={style}
        className={cn('group relative aspect-square touch-none overflow-hidden rounded-xl2 border border-border bg-surface-2', isDragging && 'z-10 opacity-70 shadow-elev-3')}
      >
        <img src={url} alt={item.file.name} onLoad={() => URL.revokeObjectURL(url)} className="h-full w-full object-cover" />
        <span className="absolute bottom-1 start-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">{index + 1}</span>
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="absolute top-1 start-1 flex h-6 w-6 cursor-grab items-center justify-center rounded-full bg-black/60 text-white active:cursor-grabbing"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="absolute top-1 end-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex touch-none items-center gap-3 rounded-xl2 border border-border bg-surface-2/70 p-3',
        isDragging && 'z-10 opacity-70 shadow-elev-3',
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
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface text-muted-foreground">
        <FileIcon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground" dir="ltr" title={item.file.name}>
          {index + 1}. {item.file.name}
        </p>
        <p className="text-xs text-muted-foreground">{formatBytes(item.file.size)}</p>
      </div>
      <button type="button" onClick={onRemove} className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-surface hover:text-danger">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
