import { MarketplaceBoard } from '@/components/marketplace/MarketplaceBoard';
import { CommunityShell } from '@/components/community/CommunityShell';

export default function MarketplacePage() {
  return (
    <CommunityShell>
      <MarketplaceBoard />
    </CommunityShell>
  );
}
