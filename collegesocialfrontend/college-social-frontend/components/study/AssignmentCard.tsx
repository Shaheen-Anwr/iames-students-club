'use client';

import { useState } from 'react';
import { differenceInCalendarDays, format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { CalendarClock, CheckCircle2, Circle, Trash2 } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { RoleBadge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { AttachmentPreview } from '@/components/feed/AttachmentPreview';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { assetUrl, cn } from '@/lib/utils';
import type { Assignment } from '@/lib/types';

function urgencyOf(dueDate: string, completed: boolean) {
  if (completed) return 'completed' as const;
  const daysLeft = differenceInCalendarDays(new Date(dueDate), new Date());
  if (daysLeft < 0) return 'overdue' as const;
  if (daysLeft <= 2) return 'urgent' as const;
  return 'normal' as const;
}

function urgencyLabel(dueDate: string, urgency: ReturnType<typeof urgencyOf>) {
  if (urgency === 'completed') return { text: 'مكتمل', classes: 'bg-success/15 text-success' };
  const daysLeft = differenceInCalendarDays(new Date(dueDate), new Date());
  if (urgency === 'overdue') {
    const daysOver = Math.abs(daysLeft);
    return { text: daysOver === 0 ? 'متأخر' : `متأخر منذ ${daysOver} يوم`, classes: 'bg-danger/15 text-danger' };
  }
  if (urgency === 'urgent') {
    return { text: daysLeft === 0 ? 'يستحق اليوم' : daysLeft === 1 ? 'يستحق غدًا' : `متبقي ${daysLeft} أيام`, classes: 'bg-warning/15 text-warning' };
  }
  return null;
}

const BORDER_CLASSES: Record<ReturnType<typeof urgencyOf>, string> = {
  overdue: 'border-s-4 border-s-danger',
  urgent: 'border-s-4 border-s-warning',
  normal: 'border-s-4 border-s-border',
  completed: 'border-s-4 border-s-success',
};

export function AssignmentCard({ assignment, onDeleted }: { assignment: Assignment; onDeleted: (id: string) => void }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [completedBy, setCompletedBy] = useState(assignment.completedBy);
  const [busy, setBusy] = useState(false);

  const completed = !!user && completedBy.includes(user._id);
  const urgency = urgencyOf(assignment.dueDate, completed);
  const badge = urgencyLabel(assignment.dueDate, urgency);
  const isCreator = !!assignment.createdBy && user?._id === assignment.createdBy._id;

  async function toggleComplete() {
    if (!user || busy) return;
    setBusy(true);
    const wasCompleted = completed;
    setCompletedBy((prev) => (wasCompleted ? prev.filter((id) => id !== user._id) : [...prev, user._id]));
    try {
      await api.post(`/assignments/${assignment._id}/complete`);
    } catch {
      setCompletedBy((prev) => (wasCompleted ? [...prev, user._id] : prev.filter((id) => id !== user._id)));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!confirm('هل تريد حذف هذا الواجب؟')) return;
    try {
      await api.delete(`/assignments/${assignment._id}`);
      onDeleted(assignment._id);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر حذف الواجب.', 'error');
    }
  }

  return (
    <Card className={cn('p-5', BORDER_CLASSES[urgency], completed && 'opacity-60')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{assignment.title}</h3>
            <span className="rounded-full bg-surface-2/70 px-2 py-0.5 text-xs text-muted-foreground">{assignment.courseCode}</span>
            {assignment.isPersonal && (
              <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">شخصي</span>
            )}
            {badge && <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', badge.classes)}>{badge.text}</span>}
          </div>
          {assignment.createdBy && (
            <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Avatar src={assetUrl(assignment.createdBy.photoUrl)} name={assignment.createdBy.name} size="xs" />
              <span>{assignment.createdBy.name}</span>
              <RoleBadge role={assignment.createdBy.role} />
            </div>
          )}
        </div>
        {isCreator && (
          <button
            onClick={handleDelete}
            className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <CalendarClock className="h-3.5 w-3.5" />
        {format(new Date(assignment.dueDate), 'EEEE، d MMMM yyyy - HH:mm', { locale: ar })}
      </div>

      {assignment.description && (
        <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">{assignment.description}</p>
      )}

      {assignment.attachmentType !== 'none' && (
        <div className="mt-4">
          <AttachmentPreview
            attachmentType={assignment.attachmentType}
            attachmentUrl={assignment.attachmentUrl}
            attachmentOriginalName={assignment.attachmentOriginalName}
          />
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3.5">
        <button
          onClick={toggleComplete}
          className={cn(
            'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium transition-all active:scale-95',
            completed ? 'bg-success/10 text-success' : 'text-muted-foreground hover:bg-surface-2 hover:text-success',
          )}
        >
          {completed ? <CheckCircle2 className="h-4 w-4 fill-success/15" /> : <Circle className="h-4 w-4" />}
          تم الإنجاز
        </button>
        {completedBy.length > 0 && <span className="text-xs text-muted-foreground">{completedBy.length} طلاب أنجزوا</span>}
      </div>
    </Card>
  );
}
