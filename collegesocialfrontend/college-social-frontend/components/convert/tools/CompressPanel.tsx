'use client';

import { useEffect, useRef, useState } from 'react';
import { FileArchive, FileUp } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { EmptyState } from '@/components/ui/EmptyState';
import { JobProgressCard, useJobPoll } from '@/components/convert/JobProgress';
import { formatBytes } from '@/lib/convert-format';
import { convertTools, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { cn } from '@/lib/utils';

const LEVELS: { value: 'low' | 'medium' | 'high'; label: string; hint: string }[] = [
  { value: 'low', label: 'ضغط خفيف', hint: 'أفضل جودة، تقليل أقل للحجم' },
  { value: 'medium', label: 'ضغط متوسط', hint: 'توازن بين الجودة والحجم' },
  { value: 'high', label: 'ضغط قوي', hint: 'أصغر حجم، جودة أقل' },
];

export function CompressPanel() {
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [level, setLevel] = useState<'low' | 'medium' | 'high'>('medium');
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useJobPoll(jobId);

  useEffect(() => {
    convertTools
      .capabilities()
      .then((c) => setAvailable(c.compressAvailable))
      .catch(() => setAvailable(false));
  }, []);

  async function submit() {
    if (!file) {
      showToast('اختر ملف PDF أولًا', 'error');
      return;
    }
    setUploadPct(0);
    try {
      const { id } = await convertTools.compress(file, level, setUploadPct);
      setJobId(id);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر بدء الضغط', 'error');
    } finally {
      setUploadPct(null);
    }
  }

  if (available === false) {
    return <EmptyState icon={FileArchive} title="الأداة غير متاحة حاليًا" description="ضغط الملفات يتطلّب خدمة غير متوفرة الآن." />;
  }

  return (
    <div className="space-y-4">
      <Card
        className="cursor-pointer border-2 border-dashed border-strong p-6 text-center transition-colors hover:border-accent"
        onClick={() => inputRef.current?.click()}
      >
        <FileUp className="mx-auto h-6 w-6 text-accent" />
        <p className="mt-2 text-sm font-medium text-foreground">{file ? file.name : 'اختر ملف PDF'}</p>
        {file && <p className="mt-0.5 text-xs text-muted-foreground">{formatBytes(file.size)}</p>}
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="pointer-events-none absolute h-px w-px opacity-0"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            setFile(e.currentTarget.files?.[0] ?? null);
            e.currentTarget.value = '';
          }}
        />
      </Card>

      <div className="grid grid-cols-3 gap-2">
        {LEVELS.map((l) => (
          <button
            key={l.value}
            type="button"
            onClick={() => setLevel(l.value)}
            className={cn(
              'rounded-xl2 border p-2.5 text-center transition-colors',
              level === l.value ? 'border-accent bg-accent/10' : 'border-border bg-surface-2/50 hover:border-accent/40',
            )}
          >
            <p className="text-xs font-semibold text-foreground">{l.label}</p>
            <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">{l.hint}</p>
          </button>
        ))}
      </div>

      {uploadPct !== null && <ProgressBar percent={uploadPct} />}

      {!job && (
        <Button onClick={submit} disabled={!file} loading={uploadPct !== null || available === null}>
          <FileArchive className="h-4 w-4" />
          ضغط الملف
        </Button>
      )}
      <JobProgressCard job={job} downloadName={file?.name ?? 'compressed.pdf'} />
    </div>
  );
}
