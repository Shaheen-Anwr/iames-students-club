'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { MessageCircle, Search, Store, Tag, Trash2 } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { Input } from '@/components/ui/Input';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { assetUrl, cn, timeAgo } from '@/lib/utils';
import type { ListingCategory, ListingStatus, MarketplaceListing } from '@/lib/types';

const CATEGORIES: { value: ListingCategory; label: string }[] = [
  { value: 'books', label: 'كتب' },
  { value: 'electronics', label: 'إلكترونيات' },
  { value: 'notes', label: 'ملخصات' },
  { value: 'supplies', label: 'مستلزمات' },
  { value: 'other', label: 'أخرى' },
];
const CAT_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label])) as Record<ListingCategory, string>;

const STATUS_META: Record<ListingStatus, { label: string; cls: string }> = {
  available: { label: 'متاح', cls: 'bg-success/15 text-success' },
  reserved: { label: 'محجوز', cls: 'bg-warning/15 text-warning' },
  sold: { label: 'مُباع', cls: 'bg-surface-2 text-muted-foreground' },
};

function priceLabel(price: number) {
  return price === 0 ? 'مجاني' : `${price.toLocaleString('en-US')} ل.س`;
}

export function MarketplaceBoard() {
  const { showToast } = useToast();
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<ListingCategory | 'all'>('all');
  const [mine, setMine] = useState(false);
  const [q, setQ] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '50' });
    if (category !== 'all') params.set('category', category);
    if (mine) params.set('mine', 'true');
    if (q.trim()) params.set('q', q.trim());
    api
      .get<MarketplaceListing[]>(`/marketplace?${params.toString()}`)
      .then(setListings)
      .catch(() => showToast('تعذّر تحميل السوق', 'error'))
      .finally(() => setLoading(false));
  }, [category, mine, q, showToast]);

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  async function setStatus(id: string, status: ListingStatus) {
    setListings((l) => l.map((x) => (x._id === id ? { ...x, status } : x)));
    try {
      await api.patch(`/marketplace/${id}`, { status });
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر التحديث', 'error');
      load();
    }
  }

  async function remove(id: string) {
    if (!confirm('حذف هذا الإعلان؟')) return;
    const before = listings;
    setListings((l) => l.filter((x) => x._id !== id));
    try {
      await api.delete(`/marketplace/${id}`);
    } catch (err) {
      setListings(before);
      showToast(err instanceof ApiError ? err.message : 'تعذّر الحذف', 'error');
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-4 px-4 py-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <Store className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-foreground">السوق</h1>
            <p className="text-xs text-muted-foreground">بيع وشراء بين طلاب كليتك.</p>
          </div>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Tag className="h-4 w-4" />
          بيع غرض
        </Button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="ابحث…" value={q} onChange={(e) => setQ(e.target.value)} className="pe-9" />
      </div>

      <div className="scrollbar-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {(['all', ...CATEGORIES.map((c) => c.value)] as const).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className={cn(
              'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
              category === c ? 'bg-accent text-white' : 'bg-surface-2 text-muted-foreground hover:text-foreground',
            )}
          >
            {c === 'all' ? 'الكل' : CAT_LABEL[c]}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setMine((m) => !m)}
          className={cn(
            'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
            mine ? 'bg-accent text-white' : 'bg-surface-2 text-muted-foreground hover:text-foreground',
          )}
        >
          إعلاناتي
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-6 w-6" />
        </div>
      ) : listings.length === 0 ? (
        <EmptyState icon={Store} title="لا إعلانات" description={mine ? 'لم تنشر أي إعلان بعد.' : 'كن أول من يعرض غرضًا للبيع.'} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {listings.map((l) => (
            <Card key={l._id} className="flex flex-col gap-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 flex-1 text-sm font-semibold text-foreground">{l.title}</p>
                <span className="shrink-0 rounded-lg bg-accent/10 px-2 py-0.5 text-xs font-bold text-accent">
                  <bdi dir="ltr">{priceLabel(l.price)}</bdi>
                </span>
              </div>
              {l.description && (
                <p className="line-clamp-2 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{l.description}</p>
              )}
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-muted-foreground">{CAT_LABEL[l.category]}</span>
                <span className={cn('rounded-full px-2 py-0.5 font-medium', STATUS_META[l.status].cls)}>
                  {STATUS_META[l.status].label}
                </span>
                <span className="text-muted-foreground">· {timeAgo(l.createdAt)}</span>
              </div>

              <div className="mt-1 flex items-center justify-between gap-2 border-t border-border/60 pt-2">
                {l.seller && (
                  <div className="flex min-w-0 items-center gap-1.5">
                    <Avatar src={assetUrl(l.seller.photoUrl)} name={l.seller.name} size="xs" />
                    <span className="truncate text-xs text-muted-foreground">{l.seller.name}</span>
                  </div>
                )}
                {l.mine ? (
                  <div className="flex items-center gap-1.5">
                    <select
                      value={l.status}
                      onChange={(e) => setStatus(l._id, e.target.value as ListingStatus)}
                      className="h-7 rounded-lg border border-border bg-surface-2 px-1.5 text-[11px] text-foreground outline-none"
                    >
                      <option value="available">متاح</option>
                      <option value="reserved">محجوز</option>
                      <option value="sold">مُباع</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => remove(l._id)}
                      className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  l.seller && (
                    <Link
                      href={`/profile/${l.seller._id}`}
                      className="inline-flex items-center gap-1 rounded-lg bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/20"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      تواصل
                    </Link>
                  )
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <CreateListingModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(l) => {
          setCreateOpen(false);
          setListings((prev) => [l, ...prev]);
          showToast('نُشر الإعلان', 'success');
        }}
      />
    </div>
  );
}

function CreateListingModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (l: MarketplaceListing) => void;
}) {
  const { showToast } = useToast();
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState<ListingCategory>('books');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    const p = Number(price);
    if (!title.trim() || !Number.isFinite(p) || p < 0 || busy) return;
    setBusy(true);
    try {
      const created = await api.post<MarketplaceListing>('/marketplace', {
        title: title.trim(),
        price: Math.round(p),
        category,
        description: description.trim() || undefined,
      });
      onCreated(created);
      setTitle('');
      setPrice('');
      setDescription('');
      setCategory('books');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر النشر', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="بيع غرض" className="max-w-md">
      <div className="space-y-3">
        <Input placeholder="ما الذي تبيعه؟" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Input type="number" min={0} placeholder="السعر (0 = مجاني)" value={price} onChange={(e) => setPrice(e.target.value)} />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as ListingCategory)}
            className="h-10 rounded-lg border border-border bg-surface-2/50 px-3 text-sm text-foreground outline-none focus:border-accent"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="الوصف والحالة (اختياري)"
          className="w-full resize-none rounded-lg border border-border bg-surface-2/50 px-3 py-2 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
        <Button fullWidth onClick={submit} loading={busy} disabled={!title.trim() || price === ''}>
          نشر الإعلان
        </Button>
      </div>
    </Modal>
  );
}
