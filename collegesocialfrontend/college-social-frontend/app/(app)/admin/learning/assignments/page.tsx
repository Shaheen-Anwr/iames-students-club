import { CalendarDays } from 'lucide-react';
import { PageHeader } from '@/components/admin/ui/PageHeader';
import { AdminAssignmentsPanel } from '@/components/admin/AdminAssignmentsPanel';

export default function AdminAssignmentsPage() {
  return (
    <>
      <PageHeader icon={CalendarDays} title="الواجبات" description="واجبات المقررات ومواعيد استحقاقها." />
      <AdminAssignmentsPanel />
    </>
  );
}
