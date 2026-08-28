'use client';

// Delivery-time Cloudinary transforms for video, plus a helper to read a local file's play
// length before upload. Mirrors the backend's src/reels/reel-url.util.ts so a URL built here and
// one built there match.

const UPLOAD_MARKER = '/upload/';
const VIDEO_EXT_RE = /\.(mp4|mov|webm|m4v)(\?.*)?$/i;
const ALREADY_TRANSFORMED = /\/upload\/[^/]*(f_auto|q_auto|so_\d|w_\d|c_)/;

function isCloudinaryVideo(url: string): boolean {
  return url.includes('res.cloudinary.com') && url.includes(UPLOAD_MARKER);
}

// Automatic format + quality selection for fast-start playback. Safe no-op for non-Cloudinary or
// already-transformed URLs.
export function cldVideoOptimize(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  if (!isCloudinaryVideo(url) || ALREADY_TRANSFORMED.test(url)) return url;
  return url.replace(UPLOAD_MARKER, `${UPLOAD_MARKER}f_auto,q_auto/`);
}

// A single 9:16 JPEG frame ~1s in -- used as the <video> poster so a reel paints instantly.
export function buildReelThumbnailUrl(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  const i = url.indexOf(UPLOAD_MARKER);
  if (i < 0) return url;
  const head = url.slice(0, i + UPLOAD_MARKER.length);
  const tail = url.slice(i + UPLOAD_MARKER.length).replace(VIDEO_EXT_RE, '.jpg');
  return `${head}so_1,w_720,h_1280,c_fill,f_jpg,q_auto/${tail}`;
}

// Reads a video file's duration (seconds) in-browser via a throwaway <video> element. Rejects if
// the browser can't read metadata (unsupported container/codec) so the caller can decide.
export function readVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement('video');
    el.preload = 'metadata';
    el.muted = true;
    const cleanup = () => {
      URL.revokeObjectURL(url);
      el.removeAttribute('src');
      el.load();
    };
    el.onloadedmetadata = () => {
      const d = el.duration;
      cleanup();
      Number.isFinite(d) && d > 0 ? resolve(d) : reject(new Error('تعذّر قراءة مدة الفيديو'));
    };
    el.onerror = () => {
      cleanup();
      reject(new Error('تعذّر قراءة مدة الفيديو'));
    };
    el.src = url;
  });
}

export const MAX_REEL_SECONDS = 60;
