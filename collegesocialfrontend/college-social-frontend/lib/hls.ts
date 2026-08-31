'use client';

// Attaches an HLS (.m3u8) source to a <video> element. Safari plays HLS natively; everywhere else
// we lazy-load hls.js (only when a Stream reel is actually shown, so it stays out of the main
// bundle). Returns a cleanup fn to call on unmount / src change.

export function attachHls(video: HTMLVideoElement, src: string): () => void {
  // Native HLS (Safari, iOS) -- just set the src.
  if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = src;
    return () => {
      video.removeAttribute('src');
      video.load();
    };
  }

  let destroyed = false;
  let hls: { destroy: () => void } | null = null;

  import('hls.js')
    .then(({ default: Hls }) => {
      if (destroyed) return;
      if (!Hls.isSupported()) {
        video.src = src; // last resort
        return;
      }
      const instance = new Hls({ maxBufferLength: 20, enableWorker: true });
      instance.loadSource(src);
      instance.attachMedia(video);
      hls = instance;
    })
    .catch(() => {
      if (!destroyed) video.src = src;
    });

  return () => {
    destroyed = true;
    hls?.destroy();
    hls = null;
    video.removeAttribute('src');
    video.load();
  };
}

export function isHls(url: string | undefined | null): boolean {
  return !!url && url.includes('.m3u8');
}
