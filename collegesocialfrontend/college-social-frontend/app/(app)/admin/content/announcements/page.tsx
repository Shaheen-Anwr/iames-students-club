import { Megaphone } from 'lucide-react';
import { PageHeader } from '@/components/admin/ui/PageHeader';
import { AdminAnnouncementsPanel } from '@/components/admin/AdminAnnouncementsPanel';

export default function AdminAnnouncementsPage() {
  return (
    <>
      <PageHeader icon={Megaphone} title="الإعلانات" description="إعلانات المنصة والشُعب." />
      <AdminAnnouncementsPanel />
    </>
  );
}
