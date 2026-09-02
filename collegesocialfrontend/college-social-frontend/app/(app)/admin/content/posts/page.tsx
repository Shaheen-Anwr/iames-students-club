import { MessageSquareText } from 'lucide-react';
import { PageHeader } from '@/components/admin/ui/PageHeader';
import { AdminPostsPanel } from '@/components/admin/AdminPostsPanel';

export default function AdminPostsPage() {
  return (
    <>
      <PageHeader icon={MessageSquareText} title="المنشورات" description="مراجعة وحذف منشورات آخر المستخدمين." />
      <AdminPostsPanel />
    </>
  );
}
