'use client';

import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ToolUploadStep, type StagedPdf } from '@/components/convert/ToolUploadStep';
import { PdfPageThumbnailGrid, initialPages, type PageItem } from '@/components/convert/PdfPageThumbnailGrid';
import { JobProgressCard, useJobPoll } from '@/components/convert/JobProgress';
import { convertTools, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';

export function ReorderPanel() {
  const { showToast } = useToast();
  const [staged, setStaged] = useState<StagedPdf | null>(null);
  const [pages, setPages] = useState<PageItem[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const job = useJobPoll(jobId);

  async function submit() {
    if (!staged) return;
    setSubmitting(true);
    try {
      const { id } = await convertTools.reorder(
        staged.stagedId,
        pages.map((p) => p.originalIndex),
      );
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
      <p className="text-sm text-muted-foreground">اسحب الصفحات لإعادة ترتيبها، ثم اضغط "تنفيذ".</p>
      <PdfPageThumbnailGrid stagedId={staged.stagedId} pages={pages} mode="reorder" onChange={setPages} />
      {!job && (
        <Button onClick={submit} loading={submitting}>
          <ArrowLeft className="h-4 w-4" />
          تنفيذ إعادة الترتيب
        </Button>
      )}
      <JobProgressCard job={job} downloadName={staged.fileName} />
    </div>
  );
}
