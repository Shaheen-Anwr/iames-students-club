'use client';

import Link from 'next/link';
import { Store } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { useRawQuery } from '@/lib/query';
import type { MarketplaceListing } from '@/lib/types';

function priceLabel(price: number) {
  return price === 0 ? 'مجاني' : `${price.toLocaleString('en-US')} ل.س`;
}

// Recent marketplace listings in your شعبة (already department-scoped server-side) -- a small
// preview card, full board at /marketplace. Self-fetching, zero props.
export function MarketplacePreviewCard() {
  const { data: listings = [], isPending } = useRawQuery<MarketplaceListing[]>(
    ['marketplace-preview'],
    '/marketplace?limit=4',
  );

  return (
    <Card className="p-4">
      <SectionHeader
        icon={Store}
        title="أحدث إعلانات السوق"
        action={
          <Link href="/marketplace" className="text-muted-foreground hover:text-accent">
            عرض الكل
          </Link>
        }
      />
      {isPending ? null : listings.length === 0 ? (
        <EmptyState icon={Store} title="لا إعلانات بعد" description="كن أول من يعرض غرضًا للبيع." className="py-6" />
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          {listings.map((l) => (
            <Link
              key={l._id}
              href="/marketplace"
              className="rounded-xl border border-border/60 bg-surface-2/40 px-3 py-2.5 transition-colors hover:border-accent/40"
            >
              <p className="truncate text-sm font-medium text-foreground">{l.title}</p>
              <p className="mt-1 text-xs font-bold text-accent">
                <bdi dir="ltr">{priceLabel(l.price)}</bdi>
              </p>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}
