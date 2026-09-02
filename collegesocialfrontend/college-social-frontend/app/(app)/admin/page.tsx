import { AdminOverview } from '@/components/admin/AdminOverview';

// /admin — the console landing page. AdminOverview owns its own header (it carries the range
// control), so no PageHeader here.
export default function AdminOverviewPage() {
  return <AdminOverview />;
}
