import { MessageCircle } from 'lucide-react';
import { PageHeader } from '@/components/admin/ui/PageHeader';
import { AdminChatPanel } from '@/components/admin/AdminChatPanel';

export default function AdminChatPage() {
  return (
    <>
      <PageHeader
        icon={MessageCircle}
        title="المحادثات"
        description="بيانات وصفية فقط — لا يُعرض محتوى الرسائل."
      />
      <AdminChatPanel />
    </>
  );
}
