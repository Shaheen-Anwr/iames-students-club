import { Award } from 'lucide-react';
import { PageHeader } from '@/components/admin/ui/PageHeader';
import { AdminGamificationPanel } from '@/components/admin/AdminGamificationPanel';

export default function AdminGamificationPage() {
  return (
    <>
      <PageHeader icon={Award} title="النقاط والشارات" description="تعديل النقاط ومنح/سحب الشارات." />
      <AdminGamificationPanel />
    </>
  );
}
