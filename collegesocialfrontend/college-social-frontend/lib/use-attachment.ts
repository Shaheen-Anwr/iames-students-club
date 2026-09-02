'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchAttachmentObjectUrl } from './api';
import { saveBlob } from './download';

export interface AttachmentObjectUrl {
  // The blob: URL once loaded, else null. Safe to feed straight into <iframe src>.
  url: string | null;
  loading: boolean;
  // True once a load attempt has failed (e.g. the attachment was deleted, or refresh-on-401 gave up
  // because the session is truly gone).
  error: boolean;
  // Fetches the attachment if not already loaded and resolves with its blob: URL (or null on
  // failure). Concurrent callers share a single in-flight request.
  load: () => Promise<string | null>;
  // load() + trigger a browser download of the result under `filename`.
  download: (filename?: string | null) => Promise<void>;
}

// On-demand loader for a 'lecture'/'file' post attachment. Nothing is fetched until load()/download()
// is called, the request goes through the authenticated refresh-on-401 path (see
// fetchAttachmentObjectUrl), and the blob: URL is revoked automatically when the postId changes or
// the component unmounts -- so a link/preview built from this never carries a stale access token.
export function useAttachmentObjectUrl(postId: string | undefined): AttachmentObjectUrl {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const urlRef = useRef<string | null>(null);
  const promiseRef = useRef<Promise<string | null> | null>(null);

  useEffect(() => {
    // Reset when the target post changes, and clean up on unmount.
    setUrl(null);
    setError(false);
    return () => {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
      promiseRef.current = null;
    };
  }, [postId]);

  const load = useCallback(async (): Promise<string | null> => {
    if (urlRef.current) return urlRef.current;
    if (!postId) return null;
    if (!promiseRef.current) {
      setLoading(true);
      setError(false);
      promiseRef.current = fetchAttachmentObjectUrl(postId)
        .then((objectUrl) => {
          urlRef.current = objectUrl;
          setUrl(objectUrl);
          return objectUrl;
        })
        .catch(() => {
          setError(true);
          promiseRef.current = null;
          return null;
        })
        .finally(() => setLoading(false));
    }
    return promiseRef.current;
  }, [postId]);

  const download = useCallback(
    async (filename?: string | null) => {
      const objectUrl = await load();
      if (!objectUrl) return;
      try {
        // Re-read the already-fetched blob out of its object URL, then hand it to saveBlob so
        // an installed PWA (iOS especially, where `<a download>` is a no-op) gets the native
        // share sheet instead of a dead click.
        const blob = await fetch(objectUrl).then((r) => r.blob());
        await saveBlob(blob, filename || 'file');
      } catch {
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = filename || 'file';
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    },
    [load],
  );

  return { url, loading, error, load, download };
}
