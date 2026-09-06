'use client';

import { useState } from 'react';
import { FileMinus, FilePlus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ToolUploadStep, type StagedPdf } from '@/components/convert/ToolUploadStep';
import { PdfPageThumbnailGrid, initialPages, type PageItem } from '@/components/convert/PdfPageThumbnailGrid';
import { JobProgressCard, useJobPoll } from '@/components/convert/JobProgress';
import { convertTools, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { cn } from '@/lib/utils';

// One panel for both "extract pages" (keep only the selected ones) and "delete pages" (drop the
// selected ones, keep the rest) -- same selection UI, the mode toggle just changes what "selected"
// means and which button label/icon makes sense.
export function PagesPanel() {
  const { showToast } = useToast();
  const [staged, setStaged] = useState<StagedPdf | null>(null);
  const [pages, setPages] = useState<PageItem[]>([]);
  const [action, setAction] = useState<'keep' | 'delete'>('keep');
  const [jobId, setJobId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const job = useJobPoll(jobId);

  const selectedCount = pages.filter((p) => p.selected).length;

  async function submit() {
    if (!staged) return;
    const selected = pages.filter((p) => p.selected).map((p) => p.originalIndex);
    if (!selected.length) {
      showToast(action === 'keep' ? 'اختر صفحة واحدة على الأقل' : 'اختر صفحة واحدة على الأقل للحذف', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const { id } = await convertTools.pages(staged.stagedId, selected, action);
      setJobId(id);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر بدء العملية', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  if (!staged) {
    return (
      <ToolUploadStep
        onStaged={(s) => {
          setStaged(s);
          setPages(initialPages(s.pageCount));
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setAction('keep')}
          className={cn('rounded-full px-3 py-1.5 text-xs font-medium transition-colors', action === 'keep' ? 'bg-accent text-white' : 'bg-surface-2 text-muted-foreground')}
        >
          <FilePlus className="me-1.5 inline h-3.5 w-3.5" />
          استخراج صفحات
        </button>
        <button
          type="button"
          onClick={() => setAction('delete')}
          className={cn('rounded-full px-3 py-1.5 text-xs font-medium transition-colors', action === 'delete' ? 'bg-danger text-white' : 'bg-surface-2 text-muted-foreground')}
        >
          <FileMinus className="me-1.5 inline h-3.5 w-3.5" />
          حذف صفحات
        </button>
      </div>
      <p className="text-sm text-muted-foreground">
        {action === 'keep' ? 'اختر الصفحات التي تريد استخراجها في ملف جديد.' : 'اختر الصفحات التي تريد حذفها من الملف.'}
      </p>
      <PdfPageThumbnailGrid stagedId={staged.stagedId} pages={pages} mode="pages" onChange={setPages} />
      {!job && (
        <Button onClick={submit} loading={submitting} disabled={selectedCount === 0}>
          {action === 'keep' ? 'استخراج' : 'حذف'} {selectedCount > 0 ? `(${selectedCount})` : ''}
        </Button>
      )}
      <JobProgressCard job={job} downloadName={staged.fileName} />
    </div>
  );
}
