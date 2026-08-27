'use client';

import { useRef, useState } from 'react';
import { FileSpreadsheet, Upload } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';

// Admin-only. Uploads a CSV of dated التربية العسكرية sessions; the backend replaces the whole
// schedule and widens the period window to span the sheet.
export function MilitaryScheduleUpload({ onUploaded, onClose }: { onUploaded: () => void; onClose: () => void }) {
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const res = await api.upload<{ inserted: number }>('/military/schedule/upload', file);
      showToast(`تم استيراد ${res.inserted} جلسة.`);
      onUploaded();
      onClose();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر رفع الملف.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        ارفع ملف CSV يحتوي على جلسات البرنامج. يمكن تصدير ملف Excel بصيغة CSV. سيحل الملف محل الجدول الحالي بالكامل.
      </p>

      <div className="rounded-xl2 bg-surface-2/70 p-3 text-xs">
        <div className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
          <FileSpreadsheet className="h-3.5 w-3.5" />
          الأعمدة المطلوبة
        </div>
        <code dir="ltr" className="block whitespace-pre-wrap break-all text-start text-muted-foreground">
          date,title,start,end,location{'\n'}
          2026-09-01,محاضرة تمهيدية,08:00,10:00,القاعة الكبرى{'\n'}
          2026-09-02,تدريب ميداني,08:00,14:00,الساحة
        </code>
        <p className="mt-1.5 text-muted-foreground">
          العمود <span dir="ltr">location</span> اختياري. التاريخ بصيغة <span dir="ltr">YYYY-MM-DD</span> أو{' '}
          <span dir="ltr">DD/MM/YYYY</span>، والوقت بصيغة <span dir="ltr">HH:mm</span>.
        </p>
      </div>

      <Button fullWidth loading={busy} onClick={() => inputRef.current?.click()}>
        <Upload className="h-4 w-4" />
        اختيار ملف CSV
      </Button>
      <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
    </div>
  );
}
