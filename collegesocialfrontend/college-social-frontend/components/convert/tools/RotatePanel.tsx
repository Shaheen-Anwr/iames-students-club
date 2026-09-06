'use client';

import { useState } from 'react';
import { RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ToolUploadStep, type StagedPdf } from '@/components/convert/ToolUploadStep';
import { PdfPageThumbnailGrid, initialPages, type PageItem } from '@/components/convert/PdfPageThumbnailGrid';
import { JobProgressCard, useJobPoll } from '@/components/convert/JobProgress';
import { convertTools, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';

export function RotatePanel() {
  const { showToast } = useToast();
  const [staged, setStaged] = useState<StagedPdf | null>(null);
  const [pages, setPages] = useState<PageItem[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const job = useJobPoll(jobId);

  async function submit() {
    if (!staged) return;
    const rotations: Record<string, number> = {};
    for (const p of pages) if (p.rotation) rotations[String(p.originalIndex)] = p.rotation;
    if (!Object.keys(rotations).length) {
      showToast('لم تُدوِّر أي صفحة بعد', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const { id } = await convertTools.rotate(staged.stagedId, rotations);
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
      <p className="text-sm text-muted-foreground">مرّر فوق صفحة واضغط أيقونة التدوير لتدويرها 90°، ثم اضغط "تنفيذ".</p>
      <PdfPageThumbnailGrid stagedId={staged.stagedId} pages={pages} mode="rotate" onChange={setPages} />
      {!job && (
        <Button onClick={submit} loading={submitting}>
          <RotateCw className="h-4 w-4" />
          تنفيذ التدوير
        </Button>
      )}
      <JobProgressCard job={job} downloadName={staged.fileName} />
    </div>
  );
}
