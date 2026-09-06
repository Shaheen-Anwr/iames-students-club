'use client';

import { useEffect, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { api, ApiError, fetchConversionBlob } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { saveBlob } from '@/lib/download';
import { formatBytes } from '@/lib/convert-format';
import type { ConversionRecord } from '@/lib/types';

// Polls a single PDF-tool job (GET /convert/jobs?ids=) at the same 1.6s cadence FileConverter.tsx
// uses for the plain converter's queue, until it lands on done/failed.
export function useJobPoll(jobId: string | null) {
  const [job, setJob] = useState<ConversionRecord | null>(null);
  useEffect(() => {
    if (!jobId) {
      setJob(null);
      return;
    }
    let alive = true;
    const poll = async () => {
      try {
        const rows = await api.get<ConversionRecord[]>(`/convert/jobs?ids=${encodeURIComponent(jobId)}`);
        if (alive && rows[0]) setJob(rows[0]);
      } catch {
        /* keep polling */
      }
    };
    void poll();
    const t = setInterval(poll, 1600);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [jobId]);
  return job;
}

// Progress bar while queued/processing, download button when done, error text when failed. Shared
// by every PDF-tool panel so each one doesn't hand-roll this.
export function JobProgressCard({ job, downloadName }: { job: ConversionRecord | null; downloadName: string }) {
  const { showToast } = useToast();
  const [downloading, setDownloading] = useState(false);

  if (!job) return null;

  if (job.status === 'failed') {
    return <p className="text-sm text-danger">{job.error || 'تعذّر تنفيذ العملية.'}</p>;
  }

  if (job.status === 'done') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button
          loading={downloading}
          onClick={async () => {
            setDownloading(true);
            try {
              const { blob, filename } = await fetchConversionBlob(job.id);
              await saveBlob(blob, filename || downloadName);
            } catch (err) {
              showToast(err instanceof ApiError ? err.message : 'تعذّر تنزيل الملف.', 'error');
            } finally {
              setDownloading(false);
            }
          }}
        >
          <Download className="h-4 w-4" />
          تنزيل{job.sizeBytes ? ` (${formatBytes(job.sizeBytes)})` : ''}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <ProgressBar percent={Math.max(3, job.progress)} />
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {job.stage || 'قيد المعالجة'}
      </p>
    </div>
  );
}
