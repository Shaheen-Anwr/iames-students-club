'use client';

import { useEffect, useState } from 'react';
import { BellRing, Moon } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Switch } from '@/components/ui/Switch';
import { api } from '@/lib/api';
import { useRawQuery } from '@/lib/query';
import { useToast } from '@/lib/toast-context';

interface Prefs {
  mutedTypes: string[];
  quietStart: number | null;
  quietEnd: number | null;
  digestHour: number | null;
}

// Category -> the notification types it covers. Toggling a category off adds all its types to
// `mutedTypes` (phone push only; the in-app bell is unaffected).
const CATEGORIES: { key: string; label: string; hint: string; types: string[] }[] = [
  { key: 'messages', label: 'الرسائل', hint: 'الدردشة ومجموعات الدراسة', types: ['chat_message', 'channel_message'] },
  {
    key: 'engagement',
    label: 'التفاعل مع منشوراتك',
    hint: 'تعليقات، تفاعلات، ردود، وإشارات',
    types: ['post_comment', 'post_reaction', 'post_share', 'comment_reply', 'comment_reaction', 'mention'],
  },
  { key: 'qa', label: 'الأسئلة والأجوبة', hint: 'إجابات على أسئلتك', types: ['qa_answer'] },
  { key: 'friends', label: 'الأصدقاء', hint: 'طلبات الصحبة وقبولها', types: ['friend_request', 'friend_accept'] },
  {
    key: 'reels',
    label: 'اكاديميا (الريلز)',
    hint: 'إعجابات وتعليقات وإشارات على ريلزك',
    types: ['reel_like', 'reel_comment', 'reel_comment_reply', 'reel_mention'],
  },
  { key: 'wall_events', label: 'الجدار والفعاليات', hint: 'تعليقات الجدار وتذكيرات الفعاليات', types: ['wall_comment', 'event_reminder'] },
  { key: 'announcements', label: 'إعلانات الكلية', hint: 'الإعلانات الرسمية', types: ['system_announcement'] },
];

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const hhmm = (h: number) => `${String(h).padStart(2, '0')}:00`;

export function NotificationSettings() {
  const { showToast } = useToast();
  const { data, isPending } = useRawQuery<Prefs>(['/notifications/preferences'], '/notifications/preferences');
  const [prefs, setPrefs] = useState<Prefs | null>(null);

  useEffect(() => {
    if (data) setPrefs(data);
  }, [data]);

  async function save(patch: Partial<Prefs>) {
    if (!prefs) return;
    const next = { ...prefs, ...patch };
    setPrefs(next);
    try {
      const saved = await api.patch<Prefs>('/notifications/preferences', patch);
      setPrefs(saved);
    } catch {
      setPrefs(prefs); // roll back
      showToast('تعذّر حفظ التفضيل.', 'error');
    }
  }

  function categoryEnabled(types: string[]): boolean {
    if (!prefs) return true;
    // Enabled = at least one type still delivering push.
    return types.some((t) => !prefs.mutedTypes.includes(t));
  }

  function toggleCategory(types: string[], enabled: boolean) {
    if (!prefs) return;
    const set = new Set(prefs.mutedTypes);
    if (enabled) types.forEach((t) => set.delete(t));
    else types.forEach((t) => set.add(t));
    save({ mutedTypes: [...set] });
  }

  const quietOn = prefs != null && prefs.quietStart != null && prefs.quietEnd != null;

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-start gap-2.5">
        <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <div>
          <h2 className="text-sm font-semibold text-foreground">الإشعارات</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            تتحكّم بإشعارات الهاتف فقط — الجرس داخل التطبيق يسجّل كل شيء دائمًا.
          </p>
        </div>
      </div>

      {isPending || !prefs ? (
        <BellRing className="h-4 w-4 animate-pulse text-muted-foreground" />
      ) : (
        <div className="space-y-1">
          {CATEGORIES.map((c) => {
            const on = categoryEnabled(c.types);
            return (
              <div key={c.key} className="flex items-center justify-between gap-3 border-b border-border/60 py-2.5 last:border-0">
                <div className="min-w-0">
                  <p className="text-sm text-foreground">{c.label}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{c.hint}</p>
                </div>
                <Switch checked={on} onCheckedChange={(v) => toggleCategory(c.types, v)} aria-label={c.label} />
              </div>
            );
          })}

          {/* Quiet hours */}
          <div className="mt-3 border-t border-border/60 pt-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <Moon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-sm text-foreground">ساعات الهدوء</p>
                  <p className="text-[11px] text-muted-foreground">لا إشعارات هاتف خلال هذه الفترة.</p>
                </div>
              </div>
              <Switch
                checked={quietOn}
                onCheckedChange={(v) => save(v ? { quietStart: 23, quietEnd: 7 } : { quietStart: null, quietEnd: null })}
                aria-label="ساعات الهدوء"
              />
            </div>
            {quietOn && (
              <div className="mt-2.5 flex items-center gap-2 ps-6 text-xs text-muted-foreground">
                <span>من</span>
                <select
                  value={prefs.quietStart ?? 23}
                  onChange={(e) => save({ quietStart: Number(e.target.value) })}
                  className="rounded-lg border border-border bg-surface-2 px-2 py-1 text-foreground"
                >
                  {HOURS.map((h) => (
                    <option key={h} value={h}>
                      {hhmm(h)}
                    </option>
                  ))}
                </select>
                <span>إلى</span>
                <select
                  value={prefs.quietEnd ?? 7}
                  onChange={(e) => save({ quietEnd: Number(e.target.value) })}
                  className="rounded-lg border border-border bg-surface-2 px-2 py-1 text-foreground"
                >
                  {HOURS.map((h) => (
                    <option key={h} value={h}>
                      {hhmm(h)}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Digest hour */}
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/60 pt-3">
            <div>
              <p className="text-sm text-foreground">وقت ملخص الصباح</p>
              <p className="text-[11px] text-muted-foreground">متى يصلك الملخص اليومي.</p>
            </div>
            <select
              value={prefs.digestHour ?? 7}
              onChange={(e) => save({ digestHour: Number(e.target.value) })}
              className="rounded-lg border border-border bg-surface-2 px-2 py-1 text-xs text-foreground"
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {hhmm(h)}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </Card>
  );
}
