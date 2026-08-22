'use client';

import { useEffect, useState } from 'react';
import { Link2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { LinkPreview } from '@/lib/types';

// Module-level so the preview for a given URL is fetched once per page session, not once per
// mounted bubble (the same link can appear in many messages, and re-renders shouldn't refetch).
const previewCache = new Map<string, Promise<LinkPreview | null>>();

function fetchPreview(url: string): Promise<LinkPreview | null> {
  let promise = previewCache.get(url);
  if (!promise) {
    promise = api.get<LinkPreview>(`/chat/link-preview?url=${encodeURIComponent(url)}`).catch((err) => {
      // A rejected 4xx (private/unreachable/non-html url) just means "no card" -- not an error
      // worth surfacing, since the raw link is already clickable in the message text above.
      if (err instanceof ApiError) return null;
      throw err;
    });
    previewCache.set(url, promise);
  }
  return promise;
}

export function LinkPreviewCard({ url, isOwn }: { url: string; isOwn: boolean }) {
  const [preview, setPreview] = useState<LinkPreview | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetchPreview(url).then((data) => {
      if (!cancelled) setPreview(data);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (preview === null) return null;

  let hostname = url;
  try {
    hostname = new URL(url).hostname;
  } catch {
    // keep the raw url as a fallback label
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'animate-bubble-in flex w-64 flex-col overflow-hidden rounded-2xl border transition-transform hover:-translate-y-0.5',
        isOwn ? 'border-white/20 bg-white/10' : 'border-border bg-surface',
      )}
    >
      {preview === undefined ? (
        <div className="h-28 w-full animate-pulse bg-surface-2/70" />
      ) : (
        preview.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview.image} alt="" className="h-28 w-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
        )
      )}
      <div className="flex items-start gap-2 px-3 py-2.5">
        <Link2 className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', isOwn ? 'text-white/70' : 'text-muted-foreground')} />
        <div className="min-w-0">
          <p className={cn('truncate text-xs font-medium', isOwn ? 'text-white' : 'text-foreground')}>
            {preview === undefined ? 'جارٍ التحميل…' : preview?.title || hostname}
          </p>
          <p className={cn('truncate text-[11px]', isOwn ? 'text-white/70' : 'text-muted-foreground')}>{hostname}</p>
        </div>
      </div>
    </a>
  );
}
