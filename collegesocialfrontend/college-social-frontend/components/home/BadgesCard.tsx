import Link from 'next/link';
import { Award } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { BadgeShelf } from '@/components/gamification/BadgeShelf';

// Extracted verbatim from the old hardcoded /home page (was inline JSX) so it can be one entry in
// the widget registry (lib/home-widgets.tsx) like every other section.
export function BadgesCard({ badges }: { badges: string[] }) {
  return (
    <Card className="p-4">
      <SectionHeader
        icon={Award}
        tone="gold"
        title="أوسمتك"
        action={
          <Link href="/profile" className="text-muted-foreground hover:text-accent">
            عرض الملف الشخصي
          </Link>
        }
      />
      <BadgeShelf badges={badges} />
    </Card>
  );
}
