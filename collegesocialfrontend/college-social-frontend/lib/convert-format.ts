// Shared by the plain converter (FileConverter.tsx) and every PDF tool panel.

export function formatBytes(n: number): string {
  if (!n) return '';
  if (n < 1024) return `${n} ب`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} ك.ب`;
  return `${(n / 1024 / 1024).toFixed(1)} م.ب`;
}

export function timeLeft(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'انتهت الصلاحية';
  const h = Math.floor(ms / 3_600_000);
  return h >= 1 ? `تنتهي خلال ${h} ساعة` : `تنتهي خلال ${Math.max(1, Math.round(ms / 60_000))} دقيقة`;
}
