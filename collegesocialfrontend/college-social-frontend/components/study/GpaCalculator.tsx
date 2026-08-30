'use client';

import { useEffect, useMemo, useState } from 'react';
import { Calculator, GraduationCap, Plus, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { cn } from '@/lib/utils';
import {
  GRADE_LABELS,
  GRADE_LETTERS,
  clampCreditHours,
  computeGpa,
  gpaTone,
  type GradeLetter,
} from '@/lib/gpa';
import type { GpaCourse, GpaResponse } from '@/lib/types';

const SELECT_CLASS =
  'h-9 shrink-0 rounded-lg border border-border bg-surface-2 px-2 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20';

const TONE_CLASS: Record<'good' | 'ok' | 'low', string> = {
  good: 'text-emerald-600 dark:text-emerald-400',
  ok: 'text-amber-600 dark:text-amber-400',
  low: 'text-red-600 dark:text-red-400',
};

// Show a dash instead of a hollow "0.00" until at least one graded course actually counts.
function fmtGpa(gpa: number, credits: number) {
  return credits > 0 ? gpa.toFixed(2) : '—';
}

// Neutral colour while there's nothing to grade yet; tone by band once there is.
function gpaClass(gpa: number, credits: number) {
  return credits > 0 ? TONE_CLASS[gpaTone(gpa)] : 'text-muted-foreground';
}

export function GpaCalculator() {
  const { showToast } = useToast();
  const [courses, setCourses] = useState<GpaCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [extraTerms, setExtraTerms] = useState<string[]>([]);
  const [newTerm, setNewTerm] = useState('');

  useEffect(() => {
    api
      .get<GpaResponse>('/gpa')
      .then((res) => setCourses(res.courses))
      .catch(() => showToast('تعذّر تحميل بيانات المعدل', 'error'))
      .finally(() => setLoading(false));
  }, [showToast]);

  // Everything is derived from `courses` so edits feel instant; the server just persists.
  const terms = useMemo(() => {
    const names = new Set<string>();
    for (const c of courses) names.add(c.term);
    for (const t of extraTerms) names.add(t);
    return [...names].map((term) => {
      const list = courses.filter((c) => c.term === term);
      return { term, list, ...computeGpa(list) };
    });
  }, [courses, extraTerms]);

  const cumulative = useMemo(() => computeGpa(courses), [courses]);
  const totalCredits = useMemo(
    () => Math.round(courses.reduce((s, c) => s + (Number(c.creditHours) || 0), 0) * 100) / 100,
    [courses],
  );

  function addTerm(e: React.FormEvent) {
    e.preventDefault();
    const t = newTerm.trim();
    if (!t) return;
    if (!terms.some((x) => x.term === t)) setExtraTerms((prev) => [...prev, t]);
    setNewTerm('');
  }

  // Only ever called for an empty term, so there's nothing persisted to clean up -- just drop
  // the local placeholder added via "أضف فصلًا".
  function removeTerm(term: string) {
    setExtraTerms((prev) => prev.filter((t) => t !== term));
  }

  async function addCourse(term: string, draft: { name: string; creditHours: number; grade: GradeLetter | '' }) {
    try {
      const created = await api.post<GpaCourse>('/gpa', {
        name: draft.name.trim(),
        creditHours: draft.creditHours,
        term,
        grade: draft.grade || null,
      });
      setCourses((prev) => [...prev, created]);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر إضافة المقرر', 'error');
    }
  }

  async function patchCourse(id: string, partial: Partial<Pick<GpaCourse, 'name' | 'creditHours' | 'grade' | 'countsTowardGpa'>>) {
    const before = courses;
    setCourses((prev) => prev.map((c) => (c._id === id ? { ...c, ...partial } : c)));
    try {
      await api.patch<GpaCourse>(`/gpa/${id}`, partial);
    } catch (err) {
      setCourses(before);
      showToast(err instanceof ApiError ? err.message : 'تعذّر حفظ التعديل', 'error');
    }
  }

  async function removeCourse(id: string) {
    const before = courses;
    setCourses((prev) => prev.filter((c) => c._id !== id));
    try {
      await api.delete(`/gpa/${id}`);
    } catch {
      setCourses(before);
      showToast('تعذّر حذف المقرر', 'error');
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Calculator className="h-5 w-5 text-accent" />
        <h1 className="text-lg font-semibold text-foreground">حساب المعدل التراكمي</h1>
      </div>

      {/* Cumulative GPA */}
      <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent">
            <GraduationCap className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">المعدل التراكمي (من 4.0)</p>
            <p className={cn('text-3xl font-bold tabular-nums', gpaClass(cumulative.gpa, cumulative.credits))}>
              {fmtGpa(cumulative.gpa, cumulative.credits)}
            </p>
          </div>
        </div>
        <div className="flex gap-6 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">ساعات محتسبة</p>
            <p className="font-semibold text-foreground tabular-nums">{cumulative.credits}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">إجمالي الساعات</p>
            <p className="font-semibold text-foreground tabular-nums">{totalCredits}</p>
          </div>
        </div>
      </Card>

      {/* New term */}
      <form onSubmit={addTerm} className="flex gap-2">
        <Input
          value={newTerm}
          onChange={(e) => setNewTerm(e.target.value)}
          placeholder="أضف فصلًا دراسيًا (مثال: الفصل الأول 2024/2025)"
          className="flex-1"
        />
        <Button type="submit" variant="outline" size="sm">
          <Plus className="h-4 w-4" />
          فصل
        </Button>
      </form>

      {terms.length === 0 ? (
        <div className="rounded-xl2 border border-dashed border-border bg-surface-2/40">
          <EmptyState
            icon={GraduationCap}
            title="لا فصول بعد"
            description="أضف فصلًا دراسيًا لتبدأ بإدخال مقرراتك ودرجاتها."
          />
        </div>
      ) : (
        terms.map(({ term, list, gpa, credits }) => (
          <TermSection
            key={term}
            term={term}
            courses={list}
            gpa={gpa}
            credits={credits}
            onAdd={(draft) => addCourse(term, draft)}
            onPatch={patchCourse}
            onRemove={removeCourse}
            onRemoveTerm={list.length === 0 ? () => removeTerm(term) : undefined}
          />
        ))
      )}
    </div>
  );
}

function TermSection({
  term,
  courses,
  gpa,
  credits,
  onAdd,
  onPatch,
  onRemove,
  onRemoveTerm,
}: {
  term: string;
  courses: GpaCourse[];
  gpa: number;
  credits: number;
  onAdd: (draft: { name: string; creditHours: number; grade: GradeLetter | '' }) => void;
  onPatch: (id: string, partial: Partial<Pick<GpaCourse, 'name' | 'creditHours' | 'grade' | 'countsTowardGpa'>>) => void;
  onRemove: (id: string) => void;
  /** Present only when the term is empty -- removes the (unsaved) term placeholder. */
  onRemoveTerm?: () => void;
}) {
  const [name, setName] = useState('');
  const [creditHours, setCreditHours] = useState('3');
  const [grade, setGrade] = useState<GradeLetter | ''>('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const hours = clampCreditHours(Number(creditHours));
    if (!name.trim() || hours === null) return;
    onAdd({ name: name.trim(), creditHours: hours, grade });
    setName('');
    setCreditHours('3');
    setGrade('');
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-surface-2/50 px-4 py-2.5">
        <p className="truncate text-sm font-semibold text-foreground">{term}</p>
        <div className="flex shrink-0 items-center gap-1.5">
          <p className="text-xs text-muted-foreground">
            معدل الفصل <span className={cn('font-bold tabular-nums', gpaClass(gpa, credits))}>{fmtGpa(gpa, credits)}</span>
            <span className="mx-1.5 opacity-40">·</span>
            {credits} ساعة
          </p>
          {onRemoveTerm && (
            <button
              type="button"
              onClick={onRemoveTerm}
              className="rounded-lg p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
              title="حذف هذا الفصل"
              aria-label="حذف هذا الفصل"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="divide-y divide-border">
        {courses.map((c) => (
          <div key={c._id} className="flex flex-wrap items-center gap-2 px-3 py-2">
            <input
              // Keyed by the persisted name so the field snaps back to the real value if an
              // optimistic patch is rolled back (the input is otherwise uncontrolled).
              key={`name-${c.name}`}
              defaultValue={c.name}
              aria-label="اسم المقرر"
              onBlur={(e) => {
                const v = e.target.value.trim();
                e.target.value = v || c.name;
                if (v && v !== c.name) onPatch(c._id, { name: v });
              }}
              className="w-full min-w-0 rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm text-foreground hover:border-border focus:border-accent focus:outline-none sm:w-auto sm:flex-1"
            />
            <input
              key={`ch-${c.creditHours}`}
              type="number"
              inputMode="decimal"
              min={0.5}
              max={12}
              step={0.5}
              defaultValue={c.creditHours}
              onBlur={(e) => {
                const v = clampCreditHours(Number(e.target.value));
                e.target.value = String(v ?? c.creditHours);
                if (v !== null && v !== c.creditHours) onPatch(c._id, { creditHours: v });
              }}
              className="h-9 w-14 shrink-0 rounded-lg border border-border bg-surface-2 px-2 text-center text-sm tabular-nums focus:border-accent focus:outline-none"
              title="عدد الساعات المعتمدة"
              aria-label="عدد الساعات المعتمدة"
            />
            <select
              value={c.grade ?? ''}
              onChange={(e) => onPatch(c._id, { grade: (e.target.value || null) as GradeLetter | null })}
              className={SELECT_CLASS}
              title={c.grade ? `التقدير — ${GRADE_LABELS[c.grade]}` : 'التقدير (قيد الدراسة)'}
              aria-label="التقدير"
            >
              <option value="">— قيد الدراسة</option>
              {GRADE_LETTERS.map((g) => (
                <option key={g} value={g}>
                  {g} — {GRADE_LABELS[g]}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onPatch(c._id, { countsTowardGpa: !c.countsTowardGpa })}
              aria-pressed={c.countsTowardGpa}
              title={c.countsTowardGpa ? 'محتسب في المعدل — اضغط للاستثناء' : 'غير محتسب في المعدل — اضغط للاحتساب'}
              className={cn(
                'shrink-0 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors',
                c.countsTowardGpa ? 'bg-accent/10 text-accent' : 'bg-surface-2 text-muted-foreground line-through',
              )}
            >
              يُحتسب
            </button>
            <button
              type="button"
              onClick={() => onRemove(c._id)}
              className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
              title="حذف المقرر"
              aria-label="حذف المقرر"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Add course */}
      <form onSubmit={submit} className="flex flex-wrap items-center gap-2 border-t border-border bg-surface-2/30 px-3 py-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="اسم المقرر"
          aria-label="اسم المقرر الجديد"
          className="w-full min-w-0 rounded-lg border border-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none sm:w-auto sm:flex-1"
        />
        <input
          type="number"
          inputMode="decimal"
          min={0.5}
          max={12}
          step={0.5}
          value={creditHours}
          onChange={(e) => setCreditHours(e.target.value)}
          className="h-9 w-14 shrink-0 rounded-lg border border-border bg-surface px-2 text-center text-sm tabular-nums focus:border-accent focus:outline-none"
          title="عدد الساعات"
          aria-label="عدد الساعات"
        />
        <select
          value={grade}
          onChange={(e) => setGrade(e.target.value as GradeLetter | '')}
          className={SELECT_CLASS}
          aria-label="التقدير"
        >
          <option value="">— قيد الدراسة</option>
          {GRADE_LETTERS.map((g) => (
            <option key={g} value={g}>
              {g} — {GRADE_LABELS[g]}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" variant="subtle" disabled={!name.trim()} aria-label="إضافة المقرر">
          <Plus className="h-4 w-4" />
        </Button>
      </form>
    </Card>
  );
}
