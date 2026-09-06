'use client';

import { useState } from 'react';
import { Scissors } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ToolUploadStep, type StagedPdf } from '@/components/convert/ToolUploadStep';
import { PdfPageThumbnailGrid, initialPages, type PageItem } from '@/components/convert/PdfPageThumbnailGrid';
import { JobProgressCard, useJobPoll } from '@/components/convert/JobProgress';
import { convertTools, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';

export function SplitPanel() {
  const { showToast } = useToast();
  const [staged, setStaged] = useState<StagedPdf | null>(null);
  const [pages, setPages] = useState<PageItem[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const job = useJobPoll(jobId);

  const groupCount = new Set(pages.map((p) => p.group)).size;

  async function submit() {
    if (!staged) return;
    const groupNums = [...new Set(pages.map((p) => p.group))].sort((a, b) => a - b);
    const groups = groupNums.map((g) => pages.filter((p) => p.group === g).map((p) => p.originalIndex));
    setSubmitting(true);
    try {
      const { id } = await convertTools.split(staged.stagedId, groups);
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
      <p className="text-sm text-muted-foreground">
        استخدم +/- على كل صفحة لتحديد رقم الملف الذي تنتمي إليه. كل رقم يصبح ملف PDF منفصل ضمن ملف مضغوط واحد.
      </p>
      <PdfPageThumbnailGrid stagedId={staged.stagedId} pages={pages} mode="split" onChange={setPages} />
      {!job && (
        <Button onClick={submit} loading={submitting}>
          <Scissors className="h-4 w-4" />
          تقسيم إلى {groupCount} ملف{groupCount === 1 ? '' : 'ات'}
        </Button>
      )}
      <JobProgressCard job={job} downloadName={staged.fileName.replace(/\.pdf$/i, '.zip')} />
    </div>
  );
}
