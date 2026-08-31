'use client';

// Uploads a video straight to Cloudflare Stream. The browser gets a one-time tus URL from our API
// (POST /api/stream/direct-upload), pushes the bytes to Cloudflare directly (never through our
// server), then polls until Stream finishes transcoding. Returns the HLS manifest + thumbnail.
//
// Used by lib/reels.ts as the preferred path; it falls back to the Cloudinary flow when Stream
// isn't configured on the backend (the sign call 503s).

import * as tus from 'tus-js-client';
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
    const upload = new tus.Upload(file, {
      uploadUrl: uploadURL, // resume/PATCH straight to the pre-created Stream resource
      chunkSize: 50 * 1024 * 1024, // Stream requires a fixed chunk size for tus
      metadata: { name: file.name, filetype: file.type || 'video/mp4' },
      retryDelays: [0, 1000, 3000, 5000, 10000],
      onError: (err) => reject(err),
      onProgress: (sent, total) => {
        if (total > 0) opts.onProgress?.(Math.min(99, Math.round((sent / total) * 100)));
      },
      onSuccess: () => resolve(),
    });

    opts.signal?.addEventListener('abort', () => {
      upload.abort();
      reject(new DOMException('Aborted', 'AbortError'));
    });

    upload.start();
  });

  // Stream transcodes asynchronously -- poll until readyToStream (up to ~2 min).
  for (let i = 0; i < 40; i += 1) {
    if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const s = await api.get<StreamStatus>(`/stream/${uid}/status`);
    if (s.ready) {
      opts.onProgress?.(100);
      return { uid, playbackUrl: s.playbackUrl, thumbnailUrl: s.thumbnailUrl, durationSec: s.durationSec };
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error('انتهت مهلة معالجة الفيديو، حاول مرة أخرى بعد قليل.');
}
