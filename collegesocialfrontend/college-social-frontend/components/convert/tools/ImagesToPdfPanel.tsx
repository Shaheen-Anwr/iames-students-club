'use client';

import { useRef, useState } from 'react';
import { FileUp, Images } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { FileOrderGrid, type OrderedFile } from '@/components/convert/FileOrderGrid';
import { JobProgressCard, useJobPoll } from '@/components/convert/JobProgress';
import { convertTools, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';

let seq = 0;

export function ImagesToPdfPanel() {
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<OrderedFile[]>([]);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useJobPoll(jobId);

  function addFiles(list: FileList | File[]) {
    const picked = Array.from(list).filter((f) => f.type.startsWith('image/'));
    if (!picked.length) return;
    setFiles((prev) => [...prev, ...picked.map((file) => ({ id: `i${seq++}`, file }))]);
  }

  async function submit() {
    if (!files.length) {
      showToast('أضف صورة واحدة على الأقل', 'error');
      return;
    }
    setUploadPct(0);
    try {
      const { id } = await convertTools.imagesToPdf(
        files.map((f) => f.file),
        setUploadPct,
      );
      setJobId(id);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر بدء التحويل', 'error');
    } finally {
      setUploadPct(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card
        className="cursor-pointer border-2 border-dashed border-strong p-6 text-center transition-colors hover:border-accent"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
        }}
      >
        <FileUp className="mx-auto h-6 w-6 text-accent" />
        <p className="mt-2 text-sm font-medium text-foreground">أضف صورًا لتحويلها إلى PDF</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="pointer-events-none absolute h-px w-px opacity-0"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            if (e.currentTarget.files?.length) addFiles(e.currentTarget.files);
            e.currentTarget.value = '';
          }}
        />
      </Card>

      {files.length > 0 && (
        <>
          <p className="text-sm text-muted-foreground">اسحب لإعادة الترتيب -- كل صورة تصبح صفحة بهذا الترتيب.</p>
          <FileOrderGrid items={files} onChange={setFiles} previewAsImage />
        </>
      )}

      {uploadPct !== null && <ProgressBar percent={uploadPct} />}

      {!job && (
        <Button onClick={submit} disabled={files.length === 0} loading={uploadPct !== null}>
          <Images className="h-4 w-4" />
          إنشاء PDF {files.length > 0 ? `(${files.length} صورة)` : ''}
        </Button>
      )}
      <JobProgressCard job={job} downloadName="صور.pdf" />
    </div>
  );
}
