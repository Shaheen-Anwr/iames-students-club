'use client';

import { useRef, useState } from 'react';
import { FileText, Upload } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import type { MilitaryRosterUploadResult } from '@/lib/types';

// Admin-only. Uploads the التربية العسكرية unit name list (CSV or PDF). The backend replaces the
// whole roster, matches each name to a registered account, and returns the names it couldn't match.
export function MilitaryRosterUpload({ onUploaded, onClose }: { onUploaded: () => void; onClose: () => void }) {
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<MilitaryRosterUploadResult | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const res = await api.upload<MilitaryRosterUploadResult>('/military/roster/upload', file);
      setResult(res);
      showToast(`تم استيراد ${res.total} اسمًا، وطابقنا ${res.matched} حسابًا.`);
      onUploaded();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر رفع الملف.', 'error');
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl2 bg-surface-2/70 p-3">
            <div className="text-lg font-bold text-foreground tabular-nums">{result.total}</div>
            <div className="text-xs text-muted-foreground">إجمالي الأسماء</div>
          </div>
          <div className="rounded-xl2 bg-success/10 p-3">
            <div className="text-lg font-bold text-success tabular-nums">{result.matched}</div>
            <div className="text-xs text-muted-foreground">حسابات مطابَقة</div>
          </div>
          <div className="rounded-xl2 bg-warning/10 p-3">
            <div className="text-lg font-bold text-warning tabular-nums">{result.unmatched}</div>
            <div className="text-xs text-muted-foreground">بدون مطابقة</div>
          </div>
        </div>

        {result.unmatchedNames.length > 0 && (
          <div className="rounded-xl2 bg-surface-2/70 p-3 text-xs">
            <p className="mb-1.5 font-medium text-foreground">
              أسماء لم نجد لها حسابًا (تأكد من تطابق الاسم مع اسم التسجيل):
            </p>
            <ul className="max-h-40 space-y-0.5 overflow-y-auto text-muted-foreground">
              {result.unmatchedNames.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex gap-2">
          <Button fullWidth variant="outline" onClick={() => setResult(null)}>
            رفع ملف آخر
          </Button>
          <Button fullWidth onClick={onClose}>
            تم
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        ارفع كشف طلاب الوحدة كملف CSV أو PDF. سيحل الملف محل الكشف الحالي بالكامل، وسنطابق كل اسم بحساب
        مسجّل تلقائيًا.
      </p>

      <div className="rounded-xl2 bg-surface-2/70 p-3 text-xs">
        <div className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
          <FileText className="h-3.5 w-3.5" />
          صيغة الملف
        </div>
        <p className="text-muted-foreground">
          ملف CSV بعمود واحد للأسماء (أو عمود بعنوان <span dir="ltr">name</span> / «الاسم»)، أو ملف PDF
          فيه اسم واحد في كل سطر. الأرقام والترقيم في بداية السطر تُتجاهَل.
        </p>
      </div>

      <Button fullWidth loading={busy} onClick={() => inputRef.current?.click()}>
        <Upload className="h-4 w-4" />
        اختيار ملف CSV أو PDF
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv,.pdf,application/pdf"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
}
