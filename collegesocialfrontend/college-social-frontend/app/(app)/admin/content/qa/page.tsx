import { HelpCircle } from 'lucide-react';
import { PageHeader } from '@/components/admin/ui/PageHeader';
import { AdminQaPanel } from '@/components/admin/AdminQaPanel';

export default function AdminQaPage() {
  return (
    <>
      <PageHeader icon={HelpCircle} title="الأسئلة والأجوبة" description="أسئلة الطلاب وإجاباتها." />
      <AdminQaPanel />
    </>
  );
}
