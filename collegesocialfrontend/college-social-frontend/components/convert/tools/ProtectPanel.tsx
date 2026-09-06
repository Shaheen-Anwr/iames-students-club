'use client';

import { useEffect, useRef, useState } from 'react';
import { FileUp, Lock } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { EmptyState } from '@/components/ui/EmptyState';
import { JobProgressCard, useJobPoll } from '@/components/convert/JobProgress';
import { formatBytes } from '@/lib/convert-format';
import { convertTools, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';

export function ProtectPanel() {
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useJobPoll(jobId);

  useEffect(() => {
    convertTools
      .capabilities()
      .then((c) => setAvailable(c.protectAvailable))
      .catch(() => setAvailable(false));
  }, []);

  async function submit() {
    if (!file) {
      showToast('اختر ملف PDF أولًا', 'error');
      return;
    }
    if (password.length < 4) {
      showToast('كلمة المرور قصيرة جدًا', 'error');
      return;
    }
    setUploadPct(0);
    try {
      const { id } = await convertTools.protect(file, password, setUploadPct);
      setJobId(id);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر بدء العملية', 'error');
    } finally {
      setUploadPct(null);
    }
  }

  if (available === false) {
    return <EmptyState icon={Lock} title="الأداة غير متاحة حاليًا" description="حماية الملفات بكلمة مرور تتطلّب خدمة غير متوفرة الآن." />;
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

      <Input type="password" label="كلمة المرور" placeholder="كلمة مرور فتح الملف" value={password} onChange={(e) => setPassword(e.target.value)} />

      {uploadPct !== null && <ProgressBar percent={uploadPct} />}

      {!job && (
        <Button onClick={submit} disabled={!file} loading={uploadPct !== null || available === null}>
          <Lock className="h-4 w-4" />
          حماية بكلمة مرور
        </Button>
      )}
      <JobProgressCard job={job} downloadName={file?.name ?? 'protected.pdf'} />
    </div>
  );
}
