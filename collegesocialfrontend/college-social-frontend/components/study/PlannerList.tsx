'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { differenceInCalendarDays, format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { CalendarClock, Circle, CheckCircle2, ListTodo, Plus, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { api, ApiError } from '@/lib/api';
import { useApiQuery } from '@/lib/query';
import { useToast } from '@/lib/toast-context';
import { cn } from '@/lib/utils';
import type { PlannerTask } from '@/lib/types';

function taskUrgency(dueDate: string): 'overdue' | 'soon' | 'normal' {
  const daysLeft = differenceInCalendarDays(new Date(dueDate), new Date());
  if (daysLeft < 0) return 'overdue';
  if (daysLeft <= 2) return 'soon';
  return 'normal';
}

export function PlannerList() {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { data: tasks = [], isPending: loading } = useApiQuery<'/planner', PlannerTask[]>('/planner');
  const patchTasks = (fn: (prev: PlannerTask[]) => PlannerTask[]) =>
    qc.setQueryData<PlannerTask[]>(['/planner'], (prev) => fn(prev ?? []));

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      const task = await api.post<PlannerTask>('/planner', {
        title: title.trim(),
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        courseCode: courseCode.trim() || undefined,
      });
      patchTasks((prev) => [...prev, task].sort((a, b) => Number(a.done) - Number(b.done)));
      setTitle('');
      setDueDate('');
      setCourseCode('');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر إضافة المهمة', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggle(id: string) {
    const updated = await api.post<PlannerTask>(`/planner/${id}/toggle`);
    patchTasks((prev) => prev.map((t) => (t._id === id ? updated : t)));
  }

  async function handleDelete(id: string) {
    if (!confirm('هل تريد حذف هذه المهمة؟')) return;
    await api.delete(`/planner/${id}`);
    patchTasks((prev) => prev.filter((t) => t._id !== id));
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <form onSubmit={handleAdd} className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="sm:min-w-[180px] sm:flex-1">
            <Input placeholder="أضف مهمة جديدة..." value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <Input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="sm:w-40"
          />
          <Input
            placeholder="المقرر (اختياري)"
            value={courseCode}
            onChange={(e) => setCourseCode(e.target.value)}
            className="sm:w-36"
          />
          <Button type="submit" loading={submitting} disabled={!title.trim()}>
            <Plus className="h-4 w-4" />
            إضافة
          </Button>
        </form>
      </Card>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-6 w-6" />
        </div>
      ) : tasks.length === 0 ? (
        <div className="rounded-xl2 border border-dashed border-border bg-surface-2/40">
          <EmptyState icon={ListTodo} title="لا توجد مهام بعد" description="أضف أول مهمة لتنظيم دراستك." />
        </div>
      ) : (
        <div className="space-y-2.5">
          {tasks.map((task) => {
            const urgency = !task.done && task.dueDate ? taskUrgency(task.dueDate) : 'normal';
            return (
              <Card
                key={task._id}
                className={cn(
                  'relative flex items-center gap-3 p-3.5',
                  urgency === 'overdue' &&
                    'before:absolute before:inset-y-3 before:start-0 before:w-1 before:rounded-full before:bg-danger',
                  urgency === 'soon' &&
                    'before:absolute before:inset-y-3 before:start-0 before:w-1 before:rounded-full before:bg-warning',
                  task.done && 'opacity-60',
                )}
              >
                <button
                  onClick={() => handleToggle(task._id)}
                  className="shrink-0 text-muted-foreground transition-transform hover:scale-110 hover:text-accent active:scale-90"
                >
                  {task.done ? <CheckCircle2 className="h-5 w-5 text-success" /> : <Circle className="h-5 w-5" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={cn('text-sm font-medium text-foreground', task.done && 'line-through')}>{task.title}</p>
                  <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                    {task.dueDate && (
                      <span
                        className={cn(
                          'flex items-center gap-1',
                          urgency === 'overdue' && 'font-medium text-danger',
                          urgency === 'soon' && 'font-medium text-warning',
                        )}
                      >
                        <CalendarClock className="h-3 w-3" />
                        {format(new Date(task.dueDate), 'd MMMM', { locale: ar })}
                      </span>
                    )}
                    {task.courseCode && <span className="rounded-full bg-accent/10 px-2 py-0.5 text-accent">{task.courseCode}</span>}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(task._id)}
                  className="shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
