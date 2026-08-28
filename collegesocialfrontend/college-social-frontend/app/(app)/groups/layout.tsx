import { GroupsProvider } from '@/lib/groups-context';

export default function GroupsLayout({ children }: { children: React.ReactNode }) {
  // The /groups index is now a single full-width explorer list; group detail routes
  // (/groups/[groupId]/...) bring their own channel sidebar.
  return (
    <GroupsProvider>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </GroupsProvider>
  );
}
