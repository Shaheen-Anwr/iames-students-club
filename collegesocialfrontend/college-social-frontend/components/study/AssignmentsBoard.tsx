'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
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

export function AssignmentsBoard({
  groupId,
  military = false,
  canCreate: canCreateOverride,
}: { groupId?: string; military?: boolean; canCreate?: boolean } = {}) {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const canCreate = groupId ? !!canCreateOverride : user?.role === 'admin' || user?.role === 'professor';
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [courseCode, setCourseCode] = useState('');
  const [upcomingOnly, setUpcomingOnly] = useState(false);
  const [modalOpen, setModalOpen] = useState(() => canCreate && searchParams.get('new') === '1');

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    const params = new URLSearchParams({ limit: '50' });
    if (courseCode.trim()) params.set('courseCode', courseCode.trim());
    if (upcomingOnly) params.set('upcoming', 'true');
    if (military) params.set('military', 'true');

    const endpoint = groupId ? `/assignments/group/${groupId}?limit=50` : `/assignments?${params.toString()}`;

    api
      .get<Assignment[] | { data: Assignment[] }>(endpoint)
      .then((res) => {
        if (!isMounted) return;
        const data = Array.isArray(res) ? res : (res as { data: Assignment[] })?.data ?? [];
        setAssignments(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        console.error('Failed to fetch assignments:', err);
        if (isMounted) setAssignments([]);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [groupId, military, courseCode, upcomingOnly]);

  function handleCreated(rawAssignment: Assignment | { data: Assignment }) {
    const assignment = (rawAssignment as { data?: Assignment })?.data ?? (rawAssignment as Assignment);
    if (!assignment || typeof assignment !== 'object' || !assignment._id) return;

    setAssignments((prev) => {
      const currentList = Array.isArray(prev) ? prev : [];
      const updated = [assignment, ...currentList.filter((a) => a?._id !== assignment._id)];

      return updated.sort((a, b) => {
        const timeA = a?.dueDate ? new Date(a.dueDate).getTime() : 0;
        const timeB = b?.dueDate ? new Date(b.dueDate).getTime() : 0;
        return (isNaN(timeA) ? 0 : timeA) - (isNaN(timeB) ? 0 : timeB);
      });
    });
  }

  function handleDeleted(id: string) {
    setAssignments((prev) => (Array.isArray(prev) ? prev.filter((a) => a?._id !== id) : []));
  }

  const safeAssignments = Array.isArray(assignments) ? assignments : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="me-auto text-lg font-semibold text-foreground">{military ? 'واجبات التربية العسكرية' : 'الواجبات'}</h1>
        {canCreate && (
          <Button size="sm" onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" />
            إنشاء واجب
          </Button>
        )}
      </div>

      {!groupId && !military && (
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
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-6 w-6" />
        </div>
      ) : safeAssignments.length === 0 ? (
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
          {safeAssignments.map((assignment) => (
            <AssignmentCard key={assignment._id} assignment={assignment} onDeleted={handleDeleted} />
          ))}
        </div>
      )}

      {canCreate && (
        <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={military ? 'إنشاء واجب تربية عسكرية' : 'إنشاء واجب'}>
          <CreateAssignmentForm
            groupId={groupId}
            isMilitary={military}
            onCreated={handleCreated}
            onClose={() => setModalOpen(false)}
          />
        </Modal>
      )}
    </div>
  );
}