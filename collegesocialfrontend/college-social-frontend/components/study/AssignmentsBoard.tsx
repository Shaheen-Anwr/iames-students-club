'use client';

import { useEffect, useState } from 'react';
import { ClipboardList, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';
import type { Assignment } from '@/lib/types';
import { AssignmentCard } from './AssignmentCard';
import { CreateAssignmentForm } from './CreateAssignmentForm';

export function AssignmentsBoard() {
  const { user } = useAuth();
  const canCreate = user?.role === 'admin' || user?.role === 'professor';
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [courseCode, setCourseCode] = useState('');
  const [upcomingOnly, setUpcomingOnly] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '50' });
    if (courseCode.trim()) params.set('courseCode', courseCode.trim());
    if (upcomingOnly) params.set('upcoming', 'true');
    api
      .get<Assignment[]>(`/assignments?${params.toString()}`)
      .then(setAssignments)
      .finally(() => setLoading(false));
  }, [courseCode, upcomingOnly]);

  function handleCreated(assignment: Assignment) {
    setAssignments((prev) => [assignment, ...prev].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()));
  }

  function handleDeleted(id: string) {
    setAssignments((prev) => prev.filter((a) => a._id !== id));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="me-auto text-lg font-semibold text-foreground">الواجبات</h1>
        {canCreate && (
          <Button size="sm" onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" />
            إنشاء واجب
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="تصفية حسب رمز المقرر"
          value={courseCode}
          onChange={(e) => setCourseCode(e.target.value)}
          className="max-w-xs"
        />
        <button
          type="button"
          onClick={() => setUpcomingOnly((prev) => !prev)}
          className={cn(
            'flex h-10 shrink-0 items-center rounded-full px-4 text-sm font-medium transition-all active:scale-95',
            upcomingOnly ? 'bg-gradient-accent text-white shadow-soft' : 'bg-surface-2/70 text-muted-foreground hover:bg-surface-2',
          )}
        >
          القادمة فقط
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-6 w-6" />
        </div>
      ) : assignments.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl2 border border-dashed border-border bg-surface-2/40 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/10 text-accent">
            <ClipboardList className="h-7 w-7" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">لا توجد واجبات حاليًا</p>
            <p className="text-xs text-muted-foreground">
              {canCreate ? 'أنشئ أول واجب لمشاركته مع الطلاب.' : 'ستظهر هنا واجبات أساتذتك عند إضافتها.'}
            </p>
          </div>
          {canCreate && (
            <Button size="sm" onClick={() => setModalOpen(true)}>
              <Plus className="h-4 w-4" />
              إنشاء واجب
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {assignments.map((assignment) => (
            <AssignmentCard key={assignment._id} assignment={assignment} onDeleted={handleDeleted} />
          ))}
        </div>
      )}

      {canCreate && (
        <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="إنشاء واجب">
          <CreateAssignmentForm onCreated={handleCreated} onClose={() => setModalOpen(false)} />
        </Modal>
      )}
    </div>
  );
}
