import { Bell } from 'lucide-react';
import { PageHeader } from '@/components/admin/ui/PageHeader';
import { AdminMiscStats } from '@/components/admin/AdminMiscStats';

export default function AdminNotificationsPage() {
  return (
    <>
      <PageHeader icon={Bell} title="الإشعارات" description="الحجم ومعدل القراءة حسب النوع." />
      <AdminMiscStats section="notifications" />
    </>
  );
}
