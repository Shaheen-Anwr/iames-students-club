import { Bot } from 'lucide-react';
import { PageHeader } from '@/components/admin/ui/PageHeader';
import { AdminMiscStats } from '@/components/admin/AdminMiscStats';

export default function AdminAiPage() {
  return (
    <>
      <PageHeader icon={Bot} title="رافد (المساعد الذكي)" description="استخدام المحادثات وفهرسة المحاضرات." />
      <AdminMiscStats section="ai" />
    </>
  );
}
