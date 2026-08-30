'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Download,
  FileCog,
  FileUp,
  Loader2,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Spinner } from '@/components/ui/Spinner';
import { api, ApiError, fetchConversionObjectUrl, fetchConversionsZip } from '@/lib/api';
import { useQuery } from '@/lib/use-query';
import { useToast } from '@/lib/toast-context';
import { cn } from '@/lib/utils';
import type { ConversionRecord, ConversionStatus, ConvertCapabilities } from '@/lib/types';

function extOf(name: string): string {
  return (name.includes('.') ? name.split('.').pop()! : name).trim().toLowerCase();
}
function formatBytes(n: number): string {
  if (!n) return '';
  if (n < 1024) return `${n} ب`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} ك.ب`;
  return `${(n / 1024 / 1024).toFixed(1)} م.ب`;
}
function timeLeft(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'انتهت الصلاحية';
  const h = Math.floor(ms / 3_600_000);
  return h >= 1 ? `تنتهي خلال ${h} ساعة` : `تنتهي خلال ${Math.max(1, Math.round(ms / 60_000))} دقيقة`;
}

async function downloadOne(id: string, fallbackName: string, onError: (m: string) => void) {
  try {
    const { url, filename } = await fetchConversionObjectUrl(id);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || fallbackName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  } catch (err) {
    onError(err instanceof ApiError ? err.message : 'تعذّر تنزيل الملف.');
  }
}

type Phase = 'idle' | 'uploading' | 'queued' | 'processing' | 'done' | 'error';

interface QueueItem {
  key: string;
  file: File;
  sourceExt: string;
  target: string;
  phase: Phase;
  jobId?: string;
  progress: number;
  stage?: string;
  cached?: boolean;
  sizeBytes?: number;
  expiresAt?: string;
  error?: string;
}

let keySeq = 0;
const ACTIVE: Phase[] = ['uploading', 'queued', 'processing'];
const STATUS_TO_PHASE: Record<ConversionStatus, Phase> = {
  queued: 'queued',
  processing: 'processing',
  done: 'done',
  failed: 'error',
};

export function FileConverter() {
  const { showToast } = useToast();
  const caps = useQuery<ConvertCapabilities>('convert/capabilities', () =>
    api.get<ConvertCapabilities>('/convert/capabilities'),
  );
  const history = useQuery<ConversionRecord[]>('convert/history', () =>
    api.get<ConversionRecord[]>('/convert/history'),
  );

  const [items, setItems] = useState<QueueItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [zipping, setZipping] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<QueueItem[]>(items);
  itemsRef.current = items;
  // Stable ref to the history refetcher so effects don't churn on every render.
  const refetchHistoryRef = useRef(history.refetch);
  refetchHistoryRef.current = history.refetch;

  const matrix = caps.data?.matrix ?? {};
  const maxSizeMb = caps.data?.maxSizeMb ?? 25;
  const labelForExt = useCallback(
    (ext: string) => caps.data?.formats.find((f) => f.ext === ext)?.label ?? `.${ext}`,
    [caps.data],
  );
  const acceptAttr = useMemo(() => {
    const exts = Object.keys(matrix);
    return exts.length ? exts.map((e) => `.${e}`).join(',') : undefined;
  }, [matrix]);

  const patch = useCallback((key: string, p: Partial<QueueItem>) => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...p } : it)));
  }, []);

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      setItems((prev) => [
        ...prev,
        ...Array.from(files).map((file) => {
          const sourceExt = extOf(file.name);
          const targets = matrix[sourceExt] ?? [];
          const it: QueueItem = {
            key: `q${keySeq++}`,
            file,
            sourceExt,
            target: targets.includes('pdf') ? 'pdf' : targets[0] ?? '',
            phase: 'idle',
            progress: 0,
          };
          if (!targets.length) {
            it.phase = 'error';
            it.error = `الصيغة .${sourceExt || '?'} غير مدعومة.`;
          } else if (file.size > maxSizeMb * 1024 * 1024) {
            it.phase = 'error';
            it.error = `حجم الملف أكبر من الحدّ (${maxSizeMb} م.ب).`;
          }
          return it;
        }),
      ]);
    },
    [matrix, maxSizeMb],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
    },
    [addFiles],
  );

  // Upload every ready file (grouped by target -- one request per target), then let the poller
  // track them. The server queues each job and returns instantly.
  const startAll = useCallback(async () => {
    const ready = itemsRef.current.filter((it) => it.phase === 'idle' && it.target);
    if (!ready.length) return;
    const byTarget = new Map<string, QueueItem[]>();
    for (const it of ready) {
      const group = byTarget.get(it.target);
      if (group) group.push(it);
      else byTarget.set(it.target, [it]);
    }
    for (const it of ready) patch(it.key, { phase: 'uploading', progress: 0, error: undefined });

    await Promise.all(
      [...byTarget.entries()].map(async ([target, group]) => {
        try {
          const { jobs } = await api.convert<{ jobs: { id: string; cached: boolean; sourceName: string }[] }>(
            group.map((g) => g.file),
            target,
            (pct) => group.forEach((g) => patch(g.key, { progress: Math.min(99, pct) })),
          );
          group.forEach((g, i) => {
            const job = jobs[i];
            patch(g.key, job ? { phase: 'queued', jobId: job.id, cached: job.cached, progress: 0, stage: 'في قائمة الانتظار' } : { phase: 'error', error: 'تعذّر بدء التحويل.' });
          });
        } catch (err) {
          group.forEach((g) => patch(g.key, { phase: 'error', error: err instanceof ApiError ? err.message : 'تعذّر رفع الملفات.' }));
        }
      }),
    );
    void refetchHistoryRef.current();
  }, [patch]);

  // Poll the jobs the user is still watching.
  const activeIds = items.filter((it) => ACTIVE.includes(it.phase) && it.jobId).map((it) => it.jobId!);
  const activeKey = activeIds.slice().sort().join(',');
  useEffect(() => {
    if (!activeKey) return;
    let alive = true;
    const poll = async () => {
      try {
        const rows = await api.get<ConversionRecord[]>(`/convert/jobs?ids=${encodeURIComponent(activeKey)}`);
        if (!alive) return;
        let anyDone = false;
        setItems((prev) =>
          prev.map((it) => {
            const row = rows.find((r) => r.id === it.jobId);
            if (!row) return it;
            const phase = STATUS_TO_PHASE[row.status];
            if ((phase === 'done' || phase === 'error') && it.phase !== phase) anyDone = true;
            return {
              ...it,
              phase,
              progress: row.progress,
              stage: row.stage,
              cached: row.cached,
              sizeBytes: row.sizeBytes,
              expiresAt: row.expiresAt,
              error: phase === 'error' ? row.error ?? 'فشل التحويل.' : undefined,
            };
          }),
        );
        if (anyDone) void refetchHistoryRef.current();
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
  }, [activeKey]);

  const downloadZip = useCallback(async () => {
    const done = itemsRef.current.filter((it) => it.phase === 'done' && it.jobId);
    if (done.length < 2) return;
    setZipping(true);
    try {
      const url = await fetchConversionsZip(done.map((d) => d.jobId!));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'converted.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر تجهيز الملف المضغوط.', 'error');
    } finally {
      setZipping(false);
    }
  }, [showToast]);

  async function removeHistory(id: string) {
    try {
      await api.delete(`/convert/${id}`);
      void history.refetch();
    } catch {
      showToast('تعذّر الحذف.', 'error');
    }
  }

  const readyCount = items.filter((it) => it.phase === 'idle' && it.target).length;
  const busy = items.some((it) => ACTIVE.includes(it.phase));
  const doneCount = items.filter((it) => it.phase === 'done').length;

  return (
    <div className="space-y-6">
      <SectionHeader icon={FileCog} title="محوّل الملفات" description="حوّل بين PDF وWord وPowerPoint وExcel" />

      <Card
        className={cn('border-2 border-dashed p-6 text-center transition-colors', dragging ? 'border-accent bg-accent/5' : 'border-strong')}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-accent">
          <FileUp className="h-6 w-6" />
        </div>
        <p className="mt-3 text-sm font-medium text-foreground">اسحب الملفات هنا أو اخترها من جهازك</p>
        <p className="mt-1 text-xs text-muted-foreground">
          حتى {maxSizeMb} م.ب لكل ملف. يمكن اختيار عدة ملفات وتحويلها معًا.
        </p>
        <Button className="mt-4" onClick={() => inputRef.current?.click()} disabled={caps.isLoading || (!caps.data && !!caps.error)}>
          <FileUp className="h-4 w-4" />
          اختيار ملفات
        </Button>
        {!caps.data && !!caps.error && (
          <p className="mt-3 text-xs text-danger">
            تعذّر تحميل صيغ التحويل.{' '}
            <button onClick={() => caps.refetch()} className="underline hover:no-underline">
              إعادة المحاولة
            </button>
          </p>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={acceptAttr}
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </Card>

      <p className="rounded-xl bg-surface-2/70 px-3.5 py-2.5 text-xs leading-relaxed text-muted-foreground">
        يعمل التحويل في الخلفية — يمكنك إضافة ملفات أخرى أو مغادرة الصفحة والعودة لاحقًا. تُحفظ التنسيقات
        والجداول والخطوط وتوزيع الصفحات واتجاه العربية من اليمين إلى اليسار، ويبقى الناتج قابلًا للتعديل.
        عند التحويل بين عائلتين مختلفتين (مثل Word إلى PowerPoint) يصبح الناتج مقسّمًا حسب الصفحات مثل
        الأصل. النتائج المتطابقة تُعاد فورًا من تحويل سابق. ملفات PDF الممسوحة ضوئيًا (صور بلا نصّ) لا
        يمكن قراءتها.
      </p>

      {items.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground">قائمة التحويل</h3>
            <div className="flex items-center gap-2">
              <button onClick={() => setItems([])} className="text-xs text-muted-foreground hover:text-foreground">
                مسح الكل
              </button>
              {doneCount >= 2 && (
                <Button size="sm" variant="outline" onClick={downloadZip} loading={zipping}>
                  <Download className="h-4 w-4" />
                  تنزيل الكل ({doneCount})
                </Button>
              )}
              <Button size="sm" onClick={startAll} loading={busy} disabled={readyCount === 0}>
                تحويل{readyCount > 1 ? ` (${readyCount})` : ''}
              </Button>
            </div>
          </div>

          {items.map((item) => (
            <Card key={item.key} className="p-3.5">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted-foreground">
                  {item.phase === 'done' ? <CheckCircle2 className="h-4 w-4 text-success" /> : <FileCog className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground" dir="ltr" title={item.file.name}>
                    {item.file.name}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{formatBytes(item.file.size)}</p>

                  {item.phase !== 'done' && (matrix[item.sourceExt]?.length ?? 0) > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span dir="ltr" className="rounded-md bg-surface-2 px-1.5 py-1 font-mono text-[11px] uppercase text-muted-foreground">
                        {item.sourceExt}
                      </span>
                      <ArrowLeft className="h-3.5 w-3.5 text-muted-foreground" />
                      <select
                        value={item.target}
                        disabled={item.phase !== 'idle' && item.phase !== 'error'}
                        onChange={(e) => patch(item.key, { target: e.target.value, phase: 'idle', error: undefined })}
                        className="rounded-md border border-strong bg-surface px-2 py-1 text-xs text-foreground outline-none focus:border-accent disabled:opacity-60"
                      >
                        {matrix[item.sourceExt].map((t) => (
                          <option key={t} value={t}>
                            {labelForExt(t)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {ACTIVE.includes(item.phase) && (
                    <div className="mt-2.5">
                      <ProgressBar percent={item.phase === 'uploading' ? Math.min(15, item.progress) : Math.max(3, item.progress)} />
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {item.phase === 'uploading'
                          ? 'جارٍ الرفع…'
                          : item.stage || (item.phase === 'queued' ? 'في قائمة الانتظار' : 'جارٍ التحويل…')}
                      </p>
                    </div>
                  )}

                  {item.phase === 'error' && item.error && <p className="mt-2 text-xs text-danger">{item.error}</p>}

                  {item.phase === 'done' && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <Button
                        size="xs"
                        variant="subtle"
                        onClick={() => downloadOne(item.jobId!, item.file.name, (m) => showToast(m, 'error'))}
                      >
                        <Download className="h-3.5 w-3.5" />
                        تنزيل{item.sizeBytes ? ` (${formatBytes(item.sizeBytes)})` : ''}
                      </Button>
                      {item.cached && <span className="text-[11px] text-muted-foreground">من تحويل سابق</span>}
                      {item.expiresAt && <span className="text-[11px] text-muted-foreground">{timeLeft(item.expiresAt)}</span>}
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  {(item.phase === 'queued' || item.phase === 'processing' || item.phase === 'uploading') && (
                    <Loader2 className="h-4 w-4 animate-spin text-accent" />
                  )}
                  <button
                    onClick={() => setItems((prev) => prev.filter((it) => it.key !== item.key))}
                    aria-label="إزالة"
                    className="rounded-md p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">التحويلات الأخيرة</h3>
        {history.isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : (history.data?.length ?? 0) === 0 ? (
          <EmptyState
            icon={Clock}
            title="لا توجد تحويلات بعد"
            description="ستظهر ملفاتك المحوّلة هنا ويمكنك إعادة تنزيلها خلال 24 ساعة."
          />
        ) : (
          <div className="space-y-2">
            {history.data!.map((rec) => (
              <Card key={rec.id} className="flex items-center gap-3 p-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted-foreground">
                  {rec.status === 'done' ? (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  ) : rec.status === 'failed' ? (
                    <X className="h-4 w-4 text-danger" />
                  ) : (
                    <Loader2 className="h-4 w-4 animate-spin text-accent" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground" dir="ltr" title={rec.filename}>
                    {rec.filename}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                    <span dir="ltr" className="font-mono uppercase">
                      {rec.sourceFormat} → {rec.targetFormat}
                    </span>
                    {rec.status === 'done' ? (
                      <>
                        <span>·</span>
                        <span>{formatBytes(rec.sizeBytes)}</span>
                        <span>·</span>
                        <span>{timeLeft(rec.expiresAt)}</span>
                      </>
                    ) : rec.status === 'failed' ? (
                      <>
                        <span>·</span>
                        <span className="text-danger">فشل</span>
                      </>
                    ) : (
                      <>
                        <span>·</span>
                        <span>{rec.stage || 'قيد المعالجة'}</span>
                      </>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {rec.status === 'done' && (
                    <button
                      onClick={() => downloadOne(rec.id, rec.filename, (m) => showToast(m, 'error'))}
                      aria-label="تنزيل"
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    onClick={() => removeHistory(rec.id)}
                    aria-label="حذف"
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
