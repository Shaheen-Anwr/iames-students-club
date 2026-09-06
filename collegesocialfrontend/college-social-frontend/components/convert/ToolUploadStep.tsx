'use client';

import { useCallback, useRef, useState } from 'react';
import { FileUp, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { convertTools, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { cn } from '@/lib/utils';

export interface StagedPdf {
  stagedId: string;
  pageCount: number;
  fileName: string;
}

// Shared first step for reorder/rotate/pages/split: pick a PDF -> POST /convert/tools/stage ->
// hand the staged reference to the caller, which mounts PdfPageThumbnailGrid against it.
export function ToolUploadStep({ onStaged }: { onStaged: (staged: StagedPdf) => void }) {
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleFile = useCallback(
    async (file: File) => {
      if (!/\.pdf$/i.test(file.name)) {
        showToast('اختر ملف PDF فقط', 'error');
        return;
      }
      setUploading(true);
      setProgress(0);
      try {
        const { stagedId, pageCount } = await convertTools.stage(file, setProgress);
        onStaged({ stagedId, pageCount, fileName: file.name });
      } catch (err) {
        showToast(err instanceof ApiError ? err.message : 'تعذّر رفع الملف', 'error');
      } finally {
        setUploading(false);
      }
    },
    [onStaged, showToast],
  );

  return (
    <Card
      className={cn('relative border-2 border-dashed p-6 text-center transition-colors', dragging ? 'border-accent bg-accent/5' : 'border-strong')}
      onClick={() => !uploading && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files?.[0];
        if (f) void handleFile(f);
      }}
    >
      {uploading ? (
        <>
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-accent" />
          <p className="mt-3 text-sm text-muted-foreground">جارٍ الرفع… {progress}%</p>
        </>
      ) : (
        <>
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-accent">
            <FileUp className="h-6 w-6" />
          </div>
          <p className="mt-3 text-sm font-medium text-foreground">اسحب ملف PDF هنا أو اخترْه</p>
          <Button
            className="mt-4"
            onClick={(e) => {
              e.stopPropagation();
              inputRef.current?.click();
            }}
          >
            <FileUp className="h-4 w-4" />
            اختيار ملف PDF
          </Button>
        </>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        tabIndex={-1}
        aria-hidden="true"
        className="pointer-events-none absolute h-px w-px opacity-0"
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          e.currentTarget.value = '';
          if (f) void handleFile(f);
        }}
      />
    </Card>
  );
}
