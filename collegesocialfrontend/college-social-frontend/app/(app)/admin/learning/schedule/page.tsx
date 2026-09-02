import { CalendarClock } from 'lucide-react';
import { PageHeader } from '@/components/admin/ui/PageHeader';
import { AdminMiscStats } from '@/components/admin/AdminMiscStats';

export default function AdminSchedulePage() {
  return (
    <>
      <PageHeader icon={CalendarClock} title="الجدول والمخطط" description="تغطية الجداول الدراسية ومهام المخطط." />
      <AdminMiscStats section="study" />
    </>
  );
}
