'use client';

import { useEffect, useState } from 'react';
import { Award, Flame, Minus, Plus } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { RoleBadge } from '@/components/ui/Badge';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { assetUrl } from '@/lib/utils';
import { BADGE_META, type BadgeId, type LeaderboardEntry } from '@/lib/types';

const BADGE_IDS = Object.keys(BADGE_META) as BadgeId[];

export function AdminGamificationPanel() {
  const { showToast } = useToast();

  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pointsDelta, setPointsDelta] = useState<Record<string, string>>({});
  const [selectedBadge, setSelectedBadge] = useState<Record<string, BadgeId>>({});

  function load() {
    setLoading(true);
    api
      .get<LeaderboardEntry[]>('/admin/gamification/leaderboard?limit=50')
      .then(setEntries)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdjustPoints(entry: LeaderboardEntry) {
    const raw = pointsDelta[entry._id];
    const delta = Number(raw);
    if (!raw || Number.isNaN(delta) || delta === 0) {
      showToast('أدخل قيمة نقاط صحيحة أولًا.', 'error');
      return;
    }
    setBusyId(entry._id);
    try {
      const updated = await api.patch<{ points: number }>(`/admin/gamification/${entry._id}/points`, { delta });
      setEntries((prev) => prev.map((e) => (e._id === entry._id ? { ...e, points: updated.points } : e)));
      setPointsDelta((prev) => ({ ...prev, [entry._id]: '' }));
      showToast(`تم تعديل نقاط ${entry.name}.`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر تعديل النقاط.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function handleGrantBadge(entry: LeaderboardEntry) {
    const badgeId = selectedBadge[entry._id] ?? BADGE_IDS[0];
    setBusyId(entry._id);
    try {
      await api.post(`/admin/gamification/${entry._id}/badges`, { badgeId });
      showToast(`تم منح ${entry.name} شارة ${BADGE_META[badgeId].label}.`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر منح الشارة.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function handleRevokeBadge(entry: LeaderboardEntry) {
    const badgeId = selectedBadge[entry._id] ?? BADGE_IDS[0];
    setBusyId(entry._id);
    try {
      await api.delete(`/admin/gamification/${entry._id}/badges/${badgeId}`);
      showToast(`تم سحب شارة ${BADGE_META[badgeId].label} من ${entry.name}.`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر سحب الشارة.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner className="h-6 w-6" />
          </div>
        ) : entries.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">لا يوجد مستخدمون.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-start text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">المستخدم</th>
                  <th className="px-4 py-3 font-medium">النقاط</th>
                  <th className="px-4 py-3 font-medium">التتابع</th>
                  <th className="px-4 py-3 font-medium">تعديل النقاط</th>
                  <th className="px-4 py-3 font-medium">الشارات</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, i) => {
                  const isBusy = busyId === entry._id;
                  return (
                    <tr key={entry._id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="w-5 shrink-0 text-xs text-muted-foreground">{i + 1}</span>
                          <Avatar src={assetUrl(entry.photoUrl)} name={entry.name} size="sm" />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">{entry.name}</p>
                            <RoleBadge role={entry.role} />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">{entry.points.toLocaleString('ar-EG')}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Flame className="h-3.5 w-3.5" />
                          {entry.streakCount}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <Input
                            type="number"
                            value={pointsDelta[entry._id] ?? ''}
                            onChange={(e) => setPointsDelta((prev) => ({ ...prev, [entry._id]: e.target.value }))}
                            placeholder="±"
                            className="h-8 w-20 px-2 text-xs"
                            disabled={isBusy}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="تطبيق"
                            disabled={isBusy}
                            onClick={() => handleAdjustPoints(entry)}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <select
                            value={selectedBadge[entry._id] ?? BADGE_IDS[0]}
                            onChange={(e) => setSelectedBadge((prev) => ({ ...prev, [entry._id]: e.target.value as BadgeId }))}
                            disabled={isBusy}
                            className="h-8 rounded-lg border border-border bg-surface px-2 text-xs text-foreground focus:border-accent focus:outline-none"
                          >
                            {BADGE_IDS.map((id) => (
                              <option key={id} value={id}>
                                {BADGE_META[id].icon} {BADGE_META[id].label}
                              </option>
                            ))}
                          </select>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="منح الشارة"
                            disabled={isBusy}
                            onClick={() => handleGrantBadge(entry)}
                          >
                            <Award className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 hover:bg-danger/10 hover:text-danger"
                            title="سحب الشارة"
                            disabled={isBusy}
                            onClick={() => handleRevokeBadge(entry)}
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
