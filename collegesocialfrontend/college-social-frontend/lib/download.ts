'use client';

// Getting a fetched Blob onto the device, reliably, from every context we ship:
// desktop browsers, Android Chrome, and -- the hard one -- an installed iOS PWA, where
// `<a download>` is silently ignored and there's no address bar to fall back to.
//
// Order of attack:
//   1. Native share sheet with the file attached (`navigator.share({ files })`). This is
//      the ONLY path that actually saves a file inside a standalone iOS PWA ("Save to
//      Files" / "Save to Drive" / send to another app). Also nice on Android.
//   2. Classic `<a download>` click -- works on desktop and Android Chrome; the fallback
//      everywhere the share sheet can't take a file.
//
// Call this from a user gesture and keep the `await` chain before it short (one fetch is
// fine) -- iOS ties `navigator.share` to a still-fresh activation.
export async function saveBlob(blob: Blob, filename: string): Promise<void> {
  const safeName = filename?.trim() || 'download';
  const file = new File([blob], safeName, { type: blob.type || 'application/octet-stream' });

  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  // Only reach for the share sheet where `<a download>` is actually unreliable -- an installed
  // PWA or a touch device. A desktop browser keeps its normal, quieter direct download.
  const mm = typeof window !== 'undefined' ? window.matchMedia : undefined;
  const preferShare =
    !!mm &&
    (mm('(display-mode: standalone)').matches ||
      (nav as unknown as { standalone?: boolean })?.standalone === true ||
      mm('(pointer: coarse)').matches);

  if (preferShare && nav && typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: safeName });
      return;
    } catch (err) {
      // Dismissing the sheet is a completed interaction, not a failure -- don't double-save.
      if ((err as { name?: string } | null)?.name === 'AbortError') return;
      // Anything else (activation lost, payload rejected mid-flight): fall through.
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeName;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Generous window so a slow mobile browser has time to start the download first.
  setTimeout(() => URL.revokeObjectURL(url), 15_000);
}
