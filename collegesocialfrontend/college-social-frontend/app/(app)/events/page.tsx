import { EventsBoard } from '@/components/events/EventsBoard';
import { CommunityShell } from '@/components/community/CommunityShell';

export default function EventsPage() {
  return (
    <CommunityShell>
      <EventsBoard />
    </CommunityShell>
  );
}
