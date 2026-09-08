'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import {
  computeSafetyNumber,
  formatSafetyNumber,
  myIdentityKey,
  reconcilePeerIdentity,
  setPeerVerified,
} from '@/lib/e2ee';

interface Props {
  open: boolean;
  onClose: () => void;
  peerId: string;
  peerName: string;
}

// The safety-number screen. Two people compare the same 60-digit code out of band (read it aloud,
// or hold the screens side by side). A match means no one is in the middle. See docs/e2ee-design.md.
export function SafetyNumberModal({ open, onClose, peerId, peerName }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [sn, setSn] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);
  const [verified, setVerified] = useState(false);
  const [theirKey, setTheirKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [mine, peer] = await Promise.all([myIdentityKey(), reconcilePeerIdentity(peerId)]);
      if (!mine || !peer.identityKey) {
        setError(true);
        return;
      }
      setTheirKey(peer.identityKey);
      setChanged(peer.changed);
      setVerified(peer.verified);
      setSn(await computeSafetyNumber(mine, peer.identityKey));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [peerId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  async function toggleVerified() {
    if (!theirKey || saving) return;
    setSaving(true);
    try {
      const next = !verified;
      await setPeerVerified(peerId, theirKey, next);
      setVerified(next);
      setChanged(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="التحقق من التشفير" className="max-w-md">
      <div className="space-y-4 p-1">
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            تعذّر تحميل رمز الأمان. تأكّد من أن كلا الطرفين فعّلا التشفير.
          </p>
        ) : (
          <>
            {changed && (
              <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-amber-900 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  تغيّر رمز الأمان الخاص بـ {peerName}. غالبًا لأنه أعاد تثبيت التطبيق أو بدّل جهازه —
                  لكن تحقّق من الرمز أدناه قبل إرسال معلومات حسّاسة.
                </p>
              </div>
            )}

            <p className="text-[12.5px] leading-relaxed text-muted-foreground">
              قارن هذا الرقم مع الرقم الظاهر لدى {peerName}. إن تطابقا، فمحادثتكما محميّة ولا يمكن لأحد
              اعتراضها.
            </p>

            <div
              dir="ltr"
              className="grid grid-cols-3 gap-x-4 gap-y-2 rounded-xl bg-surface-2/70 px-4 py-4 text-center font-mono text-[15px] tracking-widest text-foreground"
            >
              {formatSafetyNumber(sn ?? '')
                .split(' ')
                .map((group, i) => (
                  <span key={i}>{group}</span>
                ))}
            </div>

            <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-3.5 py-3">
              <div className="flex items-center gap-2 text-sm">
                {verified ? (
                  <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-500" />
                ) : (
                  <ShieldQuestion className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className={verified ? 'font-medium text-foreground' : 'text-muted-foreground'}>
                  {verified ? 'موثّق' : 'لم يُوثَّق بعد'}
                </span>
              </div>
              <Button variant={verified ? 'outline' : 'primary'} size="sm" onClick={toggleVerified} loading={saving}>
                {verified ? 'إزالة التوثيق' : 'وضع علامة موثّق'}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
