import { DashboardSkeleton } from '@/components/admin/AdminSkeletons';

// Renders inside AdminConsoleShell's content area while /admin (the overview) loads.
export default function Loading() {
  return <DashboardSkeleton />;
}
