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
// True on the contexts where `<a download>` / `window.open(blob:)` are unreliable and the native
// share sheet is the only thing that actually works: an installed PWA (iOS especially, no address
// bar to fall back to) or any touch device. A desktop browser returns false and keeps its normal,
// quieter direct download / new-tab preview.
function prefersShareTarget(): boolean {
  const mm = typeof window !== 'undefined' ? window.matchMedia : undefined;
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  return (
    !!mm &&
    (mm('(display-mode: standalone)').matches ||
      (nav as unknown as { standalone?: boolean })?.standalone === true ||
      mm('(pointer: coarse)').matches)
  );
}

// Call this from a user gesture and keep the `await` chain before it short (one fetch is
// fine) -- iOS ties `navigator.share` to a still-fresh activation.
export async function saveBlob(blob: Blob, filename: string): Promise<void> {
  const safeName = filename?.trim() || 'download';
  const file = new File([blob], safeName, { type: blob.type || 'application/octet-stream' });

  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const preferShare = prefersShareTarget();

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

// Opens an already-fetched file so the user can view/save it, picking the mechanism that actually
// works per context:
//   - Touch device / installed PWA: hand it to `saveBlob` -> the native share sheet ("Save to
//     Files", "open in <app>", ...). This is the ONLY reliable path on mobile: `window.open()`
//     called after an `await` has lost its user-gesture (blocked as a pop-up), and even when it
//     isn't, iOS Safari / Android Chrome refuse to navigate a tab to a `blob:` URL.
//   - Desktop: open the file in a new tab (inline preview for PDF/image/text; a normal download
//     for everything else), falling back to `<a download>` if the pop-up is blocked.
// Call from a user gesture with a short `await` chain before it (one fetch), same as `saveBlob`.
export async function openBlob(blob: Blob, filename: string): Promise<void> {
  if (prefersShareTarget()) {
    await saveBlob(blob, filename);
    return;
  }

  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank', 'noopener,noreferrer');
  if (!win) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename?.trim() || 'download';
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  // The new tab reads the blob asynchronously -- keep it alive well past the open() call.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
