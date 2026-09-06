'use client';

import { useRef, useState } from 'react';
import { FileUp, ScanText } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { JobProgressCard, useJobPoll } from '@/components/convert/JobProgress';
import { formatBytes } from '@/lib/convert-format';
import { convertTools, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { cn } from '@/lib/utils';

const LANGS: { value: 'ara+eng' | 'ara' | 'eng'; label: string }[] = [
  { value: 'ara+eng', label: 'عربي + إنجليزي' },
  { value: 'ara', label: 'عربي فقط' },
  { value: 'eng', label: 'إنجليزي فقط' },
];

export function OcrPanel() {
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState<'ara+eng' | 'ara' | 'eng'>('ara+eng');
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useJobPoll(jobId);

  async function submit() {
    if (!file) {
      showToast('اختر ملف PDF أولًا', 'error');
      return;
    }
    setUploadPct(0);
    try {
      const { id } = await convertTools.ocr(file, language, setUploadPct);
      setJobId(id);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر بدء التعرّف الضوئي', 'error');
    } finally {
      setUploadPct(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card
        className="cursor-pointer border-2 border-dashed border-strong p-6 text-center transition-colors hover:border-accent"
        onClick={() => inputRef.current?.click()}
      >
        <FileUp className="mx-auto h-6 w-6 text-accent" />
        <p className="mt-2 text-sm font-medium text-foreground">{file ? file.name : 'اختر ملف PDF ممسوح ضوئيًا'}</p>
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
        {LANGS.map((l) => (
          <button
            key={l.value}
            type="button"
            onClick={() => setLanguage(l.value)}
            className={cn(
              'rounded-xl2 border p-2.5 text-center text-xs font-medium transition-colors',
              language === l.value ? 'border-accent bg-accent/10 text-accent' : 'border-border bg-surface-2/50 text-muted-foreground hover:border-accent/40',
            )}
          >
            {l.label}
          </button>
        ))}
      </div>

      <p className="rounded-xl bg-surface-2/70 px-3.5 py-2.5 text-xs leading-relaxed text-muted-foreground">
        يحوّل المستند إلى ملف PDF قابل للبحث والتحديد بنفس شكله الأصلي. أول استخدام للغة معيّنة قد
        يستغرق وقتًا أطول لتجهيزها على الخادم.
      </p>

      {uploadPct !== null && <ProgressBar percent={uploadPct} />}

      {!job && (
        <Button onClick={submit} disabled={!file} loading={uploadPct !== null}>
          <ScanText className="h-4 w-4" />
          بدء التعرّف الضوئي
        </Button>
      )}
      <JobProgressCard job={job} downloadName={file?.name ?? 'ocr.pdf'} />
    </div>
  );
}
