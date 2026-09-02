import { HelpCircle } from 'lucide-react';
import { PageHeader } from '@/components/admin/ui/PageHeader';
import { AdminQuizzesPanel } from '@/components/admin/AdminQuizzesPanel';

export default function AdminQuizzesPage() {
  return (
    <>
      <PageHeader icon={HelpCircle} title="الاختبارات" description="اختبارات المقررات ومحاولاتها." />
      <AdminQuizzesPanel />
    </>
  );
}
