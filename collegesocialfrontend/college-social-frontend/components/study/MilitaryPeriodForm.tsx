'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import type { MilitaryPeriod } from '@/lib/types';

export function MilitaryPeriodForm({
  period,
  onSaved,
  onClose,
}: {
  period: MilitaryPeriod | null;
  onSaved: (period: MilitaryPeriod) => void;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const [startDate, setStartDate] = useState(period?.startDate?.slice(0, 10) ?? '');
  const [endDate, setEndDate] = useState(period?.endDate?.slice(0, 10) ?? '');
  const [title, setTitle] = useState(period?.title ?? 'التربية العسكرية');
  const [quotes, setQuotes] = useState((period?.motivationalQuotes ?? []).join('\n'));
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!startDate || !endDate) {
      showToast('حدد تاريخ البداية والنهاية.', 'error');
      return;
    }
    if (new Date(startDate) >= new Date(endDate)) {
      showToast('تاريخ النهاية يجب أن يكون بعد تاريخ البداية.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const saved = await api.patch<MilitaryPeriod>('/military/period', {
        startDate: new Date(`${startDate}T00:00:00`).toISOString(),
        endDate: new Date(`${endDate}T00:00:00`).toISOString(),
        title: title.trim() || 'التربية العسكرية',
        motivationalQuotes: quotes
          .split('\n')
          .map((q) => q.trim())
          .filter(Boolean),
      });
      onSaved(saved);
      showToast('تم حفظ موعد التربية العسكرية.');
      onClose();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر حفظ الموعد.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <Input label="اسم البرنامج" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="التربية العسكرية" />

      <div className="grid grid-cols-2 gap-3">
        <Input label="من تاريخ" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
        <Input label="إلى تاريخ" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-foreground">عبارات تحفيزية (عبارة في كل سطر)</label>
        <Textarea
          rows={5}
          value={quotes}
          onChange={(e) => setQuotes(e.target.value)}
          placeholder={'الانضباط جسر بين الأهداف والإنجاز.\nكل حضور اليوم خطوة نحو التخرج.'}
        />
        <p className="text-xs text-muted-foreground">تُعرض عبارة مختلفة لكل يوم من أيام البرنامج بالتناوب.</p>
      </div>

      <Button type="submit" loading={submitting} className="w-full">
        حفظ الموعد
      </Button>
    </form>
  );
}
