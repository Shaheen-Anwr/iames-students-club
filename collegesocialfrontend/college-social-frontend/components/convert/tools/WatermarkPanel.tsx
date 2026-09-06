'use client';

import { useRef, useState } from 'react';
import { Droplets, FileUp } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { JobProgressCard, useJobPoll } from '@/components/convert/JobProgress';
import { formatBytes } from '@/lib/convert-format';
import { convertTools, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';

export function WatermarkPanel() {
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [opacity, setOpacity] = useState(25);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useJobPoll(jobId);

  async function submit() {
    if (!file) {
      showToast('اختر ملف PDF أولًا', 'error');
      return;
    }
    if (!text.trim()) {
      showToast('اكتب نص العلامة المائية', 'error');
      return;
    }
    setUploadPct(0);
    try {
      const { id } = await convertTools.watermark(file, { text: text.trim(), opacity: opacity / 100 }, setUploadPct);
      setJobId(id);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر بدء العملية', 'error');
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

      <Input label="نص العلامة المائية" placeholder="مثال: مسودة، سري، اسمك…" value={text} onChange={(e) => setText(e.target.value)} />

      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">الشفافية: {opacity}%</label>
        <input type="range" min={5} max={80} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} className="w-full accent-accent" />
      </div>

      {uploadPct !== null && <ProgressBar percent={uploadPct} />}

      {!job && (
        <Button onClick={submit} disabled={!file} loading={uploadPct !== null}>
          <Droplets className="h-4 w-4" />
          إضافة العلامة المائية
        </Button>
      )}
      <JobProgressCard job={job} downloadName={file?.name ?? 'watermarked.pdf'} />
    </div>
  );
}
