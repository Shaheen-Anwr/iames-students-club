import { WallFeed } from '@/components/wall/WallFeed';
import { CommunityShell } from '@/components/community/CommunityShell';

export default function WallPage() {
  return (
    <CommunityShell>
      <WallFeed />
    </CommunityShell>
  );
}
