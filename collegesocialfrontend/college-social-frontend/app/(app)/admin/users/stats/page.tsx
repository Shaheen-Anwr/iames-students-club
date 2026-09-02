import { BarChart3 } from 'lucide-react';
import { PageHeader } from '@/components/admin/ui/PageHeader';
import { AdminStats } from '@/components/admin/AdminStats';

export default function AdminUserStatsPage() {
  return (
    <>
      <PageHeader icon={BarChart3} title="إحصائيات المستخدمين" description="التوزيع حسب الدور والحالة والنشاط." />
      <AdminStats />
    </>
  );
}
