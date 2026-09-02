'use client';

import { useEffect, useMemo, useState } from 'react';
import { Award, Flame, Minus, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { RoleBadge } from '@/components/ui/Badge';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { nf } from '@/lib/format';
import { BADGE_META, type BadgeId, type LeaderboardEntry } from '@/lib/types';
import { DataTable } from './ui/DataTable';
import { DataTableToolbar } from './ui/DataTableToolbar';
import { DetailDrawer } from './ui/DetailDrawer';
import { exportCsv } from './ui/exportCsv';
import { useColumnPrefs } from './ui/useColumnPrefs';
import { PersonCell } from './ui/cells';
import type { Column } from './ui/types';
import type { TableSort } from './ui/useTableQuery';

const BADGE_IDS = Object.keys(BADGE_META) as BadgeId[];

export function AdminGamificationPanel() {
  const { showToast } = useToast();

  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<TableSort | null>({ id: 'points', dir: 'desc' });

  const [detail, setDetail] = useState<LeaderboardEntry | null>(null);
  const [pointsDelta, setPointsDelta] = useState('');
  const [badgeId, setBadgeId] = useState<BadgeId>(BADGE_IDS[0]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get<LeaderboardEntry[]>('/admin/gamification/leaderboard?limit=50')
      .then((res) => !cancelled && setEntries(res))
      .catch((e) => !cancelled && setError(e instanceof Error ? e : new Error('تعذّر التحميل.')))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? entries.filter((e) => e.name.toLowerCase().includes(q)) : entries;
  }, [entries, search]);

  const detailRow = detail ? (entries.find((e) => e._id === detail._id) ?? detail) : null;

  function patchEntry(id: string, patch: Partial<LeaderboardEntry>) {
    setEntries((prev) => prev.map((e) => (e._id === id ? { ...e, ...patch } : e)));
  }

  async function adjustPoints(entry: LeaderboardEntry) {
    const delta = Number(pointsDelta);
    if (!pointsDelta || Number.isNaN(delta) || delta === 0) {
      showToast('أدخل قيمة نقاط صحيحة.', 'error');
      return;
    }
    setBusy(true);
    try {
      const res = await api.patch<{ points: number }>(`/admin/gamification/${entry._id}/points`, { delta });
      patchEntry(entry._id, { points: res.points });
      setPointsDelta('');
      showToast(`تم تعديل نقاط ${entry.name}.`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر تعديل النقاط.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function grantBadge(entry: LeaderboardEntry) {
    setBusy(true);
    try {
      await api.post(`/admin/gamification/${entry._id}/badges`, { badgeId });
      showToast(`تم منح ${entry.name} شارة ${BADGE_META[badgeId].label}.`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر منح الشارة.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function revokeBadge(entry: LeaderboardEntry) {
    setBusy(true);
    try {
      await api.delete(`/admin/gamification/${entry._id}/badges/${badgeId}`);
      showToast(`تم سحب شارة ${BADGE_META[badgeId].label} من ${entry.name}.`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر سحب الشارة.', 'error');
    } finally {
      setBusy(false);
    }
  }

  const columns = useMemo<Column<LeaderboardEntry>[]>(
    () => [
      {
        id: 'rank',
        header: '#',
        width: '3rem',
        noExport: true,
        cell: (e) => {
          const rank = entries.findIndex((x) => x._id === e._id) + 1;
          return <span className="tabular-nums text-xs text-muted-foreground">{nf(rank)}</span>;
        },
      },
      {
        id: 'name',
        header: 'المستخدم',
        sortable: true,
        sortValue: (e) => e.name,
        cell: (e) => (
          <div className="flex items-center gap-2.5">
            <PersonCell name={e.name} photoUrl={e.photoUrl} />
            <RoleBadge role={e.role} />
          </div>
        ),
        exportValue: (e) => e.name,
      },
      {
        id: 'points',
        header: 'النقاط',
        sortable: true,
        sortValue: (e) => e.points,
        cell: (e) => <span className="font-semibold tabular-nums text-foreground">{nf(e.points)}</span>,
        exportValue: (e) => e.points,
      },
      {
        id: 'streakCount',
        header: 'التتابع',
        sortable: true,
        sortValue: (e) => e.streakCount,
        cell: (e) => (
          <span className="flex items-center gap-1 text-muted-foreground">
            <Flame className="h-3.5 w-3.5" />
            {nf(e.streakCount)}
          </span>
        ),
        exportValue: (e) => e.streakCount,
      },
    ],
    [entries],
  );

  const prefs = useColumnPrefs(columns);

  return (
    <div className="space-y-3">
      <DataTableToolbar
        searchInput={search}
        onSearchChange={setSearch}
        searchPlaceholder="ابحث بالاسم"
        total={filtered.length}
        density={prefs.density}
        onDensityChange={prefs.setDensity}
        columns={columns}
        visibleColumnIds={prefs.visibleColumnIds}
        onVisibleColumnsChange={prefs.setVisibleColumnIds}
        onExport={() => exportCsv('النقاط', columns, filtered)}
      />

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(e) => e._id}
        loading={loading}
        error={error}
        onRetry={() => setReloadKey((k) => k + 1)}
        sort={sort}
        onToggleSort={(id) =>
          setSort((s) => (s?.id !== id ? { id, dir: 'asc' } : s.dir === 'asc' ? { id, dir: 'desc' } : null))
        }
        onRowClick={setDetail}
        density={prefs.density}
        visibleColumnIds={prefs.visibleColumnIds}
        emptyState={<EmptyState icon={Trophy} title="لا يوجد مستخدمون" />}
      />

      <DetailDrawer
        open={!!detailRow}
        onOpenChange={(o) => !o && setDetail(null)}
        title={detailRow?.name}
        description={detailRow ? `${nf(detailRow.points)} نقطة · تتابع ${nf(detailRow.streakCount)}` : undefined}
      >
        {detailRow && (
          <div className="space-y-5 text-sm">
            <PersonCell name={detailRow.name} photoUrl={detailRow.photoUrl} />

            <div className="space-y-2 rounded-xl border border-border/70 p-3">
              <p className="text-xs font-semibold text-foreground">تعديل النقاط</p>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={pointsDelta}
                  onChange={(e) => setPointsDelta(e.target.value)}
                  placeholder="±"
                  className="h-9 w-24"
                />
                <Button size="sm" loading={busy} onClick={() => adjustPoints(detailRow)}>
                  تطبيق
                </Button>
              </div>
            </div>

            <div className="space-y-2 rounded-xl border border-border/70 p-3">
              <p className="text-xs font-semibold text-foreground">الشارات</p>
              <select
                value={badgeId}
                onChange={(e) => setBadgeId(e.target.value as BadgeId)}
                className="h-9 w-full rounded-lg border border-border bg-surface px-2 text-xs text-foreground"
              >
                {BADGE_IDS.map((id) => (
                  <option key={id} value={id}>
                    {BADGE_META[id].icon} {BADGE_META[id].label}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" loading={busy} onClick={() => grantBadge(detailRow)}>
                  <Award className="h-4 w-4" />
                  منح
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={busy}
                  onClick={() => revokeBadge(detailRow)}
                  className="hover:bg-danger/10 hover:text-danger"
                >
                  <Minus className="h-4 w-4" />
                  سحب
                </Button>
              </div>
            </div>
          </div>
        )}
      </DetailDrawer>
    </div>
  );
}
