'use client';

import { useEffect, useRef, useState } from 'react';
import { FileText, Loader2, Lock } from 'lucide-react';
import { cldOptimize } from '@/lib/images';
import { fetchAndDecryptBlob } from '@/lib/e2ee';
import { openBlob } from '@/lib/download';
import { formatBytes, cn } from '@/lib/utils';
import { useToast } from '@/lib/toast-context';
import type { Message } from '@/lib/types';
import { VoiceMessagePlayer } from './VoiceMessagePlayer';

// Renders an E2EE attachment: the CDN holds only ciphertext, so we fetch + decrypt it here with
// the key that rode inside the encrypted envelope. Images/voice decrypt on mount; files decrypt
// on tap (straight into the share/save sheet).
export function EncryptedMedia({
  message,
  isOwn,
  onImageClick,
}: {
  message: Message;
  isOwn: boolean;
  onImageClick?: (url: string, name: string, message: Message) => void;
}) {
  const media = message.media!;
  const { showToast } = useToast();
  const [objUrl, setObjUrl] = useState<string | null>(message.localMediaUrl ?? null);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>(
    message.localMediaUrl ? 'idle' : 'loading',
  );
  const [busyFile, setBusyFile] = useState(false);
  const ownUrlRef = useRef<string | null>(null);

  const inline = media.kind === 'image' || media.kind === 'voice';

  useEffect(() => {
    if (!inline || message.localMediaUrl) return;
    let cancelled = false;
    setState('loading');
    fetchAndDecryptBlob(media.url, media.mk, media.iv, media.mime)
      .then((blob) => {
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        ownUrlRef.current = url;
        setObjUrl(url);
        setState('idle');
      })
      .catch(() => !cancelled && setState('error'));
    return () => {
      cancelled = true;
      if (ownUrlRef.current) URL.revokeObjectURL(ownUrlRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media.url, media.mk, media.iv, inline]);

  async function openFile() {
    if (busyFile) return;
    setBusyFile(true);
    try {
      const blob = message.localMediaUrl
        ? await (await fetch(message.localMediaUrl)).blob()
        : await fetchAndDecryptBlob(media.url, media.mk, media.iv, media.mime);
      await openBlob(blob, media.name || 'file');
    } catch {
      showToast('تعذّر فك تشفير المرفق.', 'error');
    } finally {
      setBusyFile(false);
    }
  }

  if (state === 'error') {
    return (
      <div className="flex items-center gap-2 rounded-2xl bg-surface-2/50 px-4 py-2.5 text-[13px] italic text-muted-foreground">
        <Lock className="h-3.5 w-3.5 shrink-0" />
        تعذّر فك تشفير المرفق
      </div>
    );
  }

  if (media.kind === 'image') {
    if (state === 'loading' || !objUrl) {
      return (
        <div className="flex h-40 w-56 items-center justify-center rounded-2xl bg-surface-2/60">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      );
    }
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onImageClick?.(objUrl, media.name ?? 'صورة', message);
        }}
        className="block w-full cursor-pointer"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={cldOptimize(objUrl, { width: 1000 })}
          alt={media.name ?? 'صورة'}
          className="animate-bubble-in max-h-64 max-w-full rounded-2xl object-cover"
        />
      </button>
    );
  }

  if (media.kind === 'voice') {
    if (state === 'loading' || !objUrl) {
      return (
        <div className="flex w-64 items-center gap-2.5 rounded-2xl bg-surface-2/70 px-3 py-2.5">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground">جارٍ فك التشفير…</span>
        </div>
      );
    }
    return <VoiceMessagePlayer src={objUrl} isOwn={isOwn} duration={media.dur} />;
  }

  // file / video -> tap to decrypt + open
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        void openFile();
      }}
      disabled={busyFile}
      className={cn(
        'flex w-full max-w-full items-center gap-2.5 rounded-2xl px-4 py-3 text-start text-[15px] transition-colors disabled:opacity-70',
        isOwn ? 'bg-gradient-accent text-white' : 'bg-surface-2/70 text-foreground hover:bg-surface-2',
      )}
    >
      {busyFile ? (
        <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
      ) : (
        <FileText className="h-5 w-5 shrink-0" />
      )}
      <span className="min-w-0">
        <span className="block truncate">{media.name ?? 'مرفق'}</span>
        {media.size != null && (
          <span className={cn('block text-xs', isOwn ? 'text-white/80' : 'text-muted-foreground')}>
            {formatBytes(media.size)}
          </span>
        )}
      </span>
    </button>
  );
}
