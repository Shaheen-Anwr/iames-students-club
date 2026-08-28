'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, Link2, Share2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/lib/toast-context';
import {
  absoluteUrl,
  copyToClipboard,
  nativeShare,
  SHARE_TARGETS,
  type ShareContent,
} from '@/lib/share';

interface ShareSheetProps extends ShareContent {
  open: boolean;
  onClose: () => void;
  /** Sheet heading. */
  heading?: string;
}

export function ShareSheet({ open, onClose, url, title, text, heading = 'مشاركة' }: ShareSheetProps) {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);

  const fullUrl = absoluteUrl(url);

  useEffect(() => {
    setCanNativeShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);

  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  async function handleCopy() {
    const ok = await copyToClipboard(fullUrl);
    if (ok) {
      setCopied(true);
      showToast('تم نسخ الرابط.');
      setTimeout(() => setCopied(false), 1600);
    } else {
      showToast('تعذّر نسخ الرابط.', 'error');
    }
  }

  async function handleNativeShare() {
    const result = await nativeShare({ url: fullUrl, title, text });
    if (result === 'shared') onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={heading} className="max-w-md">
      <div className="space-y-4">
        {/* Copyable link */}
        <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-2/60 px-3 py-2">
          <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span dir="ltr" className="min-w-0 flex-1 truncate text-start text-sm text-foreground">
            {fullUrl}
          </span>
          <button
            type="button"
            onClick={handleCopy}
            className="flex shrink-0 items-center gap-1 rounded-lg bg-surface px-2.5 py-1.5 text-xs font-medium text-accent ring-1 ring-inset ring-border transition-colors hover:bg-accent/10"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'تم النسخ' : 'نسخ'}
          </button>
        </div>

        {/* Platform targets */}
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
          {canNativeShare && (
            <button
              type="button"
              onClick={handleNativeShare}
              className="flex flex-col items-center gap-1.5 rounded-xl px-1 py-3 text-xs text-foreground transition-colors hover:bg-surface-2"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent/10 text-accent">
                <Share2 className="h-5 w-5" />
              </span>
              مشاركة…
            </button>
          )}
          {SHARE_TARGETS.map((target) => (
            <a
              key={target.key}
              href={target.href({ url: fullUrl, title, text })}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => onClose()}
              className="flex flex-col items-center gap-1.5 rounded-xl px-1 py-3 text-xs text-foreground transition-colors hover:bg-surface-2"
            >
              <span
                className="flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold text-white"
                style={{ backgroundColor: target.brand }}
              >
                {target.label[0]}
              </span>
              {target.label}
            </a>
          ))}
        </div>
      </div>
    </Modal>
  );
}
