import { Users2 } from 'lucide-react';
import { PageHeader } from '@/components/admin/ui/PageHeader';
import { AdminGroupsPanel } from '@/components/admin/AdminGroupsPanel';

export default function AdminGroupsPage() {
  return (
    <>
      <PageHeader icon={Users2} title="المجموعات" description="مجموعات المذاكرة العامة والخاصة." />
      <AdminGroupsPanel />
    </>
  );
}
