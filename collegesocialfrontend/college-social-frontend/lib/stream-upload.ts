'use client';

// Uploads a video straight to Cloudflare Stream. The browser gets a one-time upload URL from our
// API (POST /api/stream/direct-upload), pushes the bytes to Cloudflare directly (never through
// our server) with a plain multipart POST -- Cloudflare's "basic upload", good up to 200 MB,
// which comfortably covers a <=60s reel. Then polls until Stream finishes transcoding.
//
// (Not tus: Cloudflare's one-time uploadURL rejects tus-js-client's HEAD offset probe with 400.)

import { api } from './api';

export interface StreamUploadResult {
  uid: string;
  playbackUrl: string; // .m3u8
  thumbnailUrl: string;
  durationSec: number;
}

interface StreamStatus {
  uid: string;
  ready: boolean;
  durationSec: number;
  playbackUrl: string;
  thumbnailUrl: string;
}

export async function uploadToStream(
  file: File,
  opts: { onProgress?: (percent: number) => void; signal?: AbortSignal } = {},
): Promise<StreamUploadResult> {
  const { uploadURL, uid } = await api.post<{ uploadURL: string; uid: string }>('/stream/direct-upload');

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', uploadURL);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        // Cap at 90 -- the remaining 10 covers Stream's async transcode (polled below).
        opts.onProgress?.(Math.min(90, Math.round((e.loaded / e.total) * 90)));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`تعذّر رفع الفيديو (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('تعذّر رفع الفيديو، تحقّق من الاتصال.'));
    xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'));

    opts.signal?.addEventListener('abort', () => xhr.abort());

    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });

  // Stream transcodes asynchronously -- poll until readyToStream (up to ~2 min).
  for (let i = 0; i < 40; i += 1) {
    if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const s = await api.get<StreamStatus>(`/stream/${uid}/status`);
    if (s.ready) {
      opts.onProgress?.(100);
      return { uid, playbackUrl: s.playbackUrl, thumbnailUrl: s.thumbnailUrl, durationSec: s.durationSec };
    }
    // ramp the bar from 90 -> 99 while transcoding
    opts.onProgress?.(Math.min(99, 90 + i));
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error('انتهت مهلة معالجة الفيديو، حاول مرة أخرى بعد قليل.');
}
