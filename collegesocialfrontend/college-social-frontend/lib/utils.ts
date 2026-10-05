import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatDistanceToNowStrict } from 'date-fns';
import { ar } from 'date-fns/locale';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// date-fns's Arabic locale puts duals in the nominative ("منذ دقيقتان"); after «منذ» / «بعد»
// Arabic needs the genitive ("منذ دقيقتين").
const AR_DUAL_GENITIVE: Record<string, string> = {
  ثانيتان: 'ثانيتين',
  دقيقتان: 'دقيقتين',
  ساعتان: 'ساعتين',
  يومان: 'يومين',
  أسبوعان: 'أسبوعين',
  شهران: 'شهرين',
  سنتان: 'سنتين',
  عامان: 'عامين',
};
const AR_DUAL_RE = new RegExp(Object.keys(AR_DUAL_GENITIVE).join('|'), 'g');

/** "منذ ٣ دقائق" / "منذ دقيقتين" -- relative time in Arabic, grammatical duals included. */
export function timeAgo(date?: string | Date | null) {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return formatDistanceToNowStrict(d, { addSuffix: true, locale: ar }).replace(AR_DUAL_RE, (m) => AR_DUAL_GENITIVE[m]);
}

export function initials(name?: string | null): string {
  if (!name || typeof name !== 'string') return '';
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

const ASSET_URL = process.env.NEXT_PUBLIC_ASSET_URL ?? 'http://localhost:3001';

// Backend returns relative paths like "/uploads/photos/x.jpg" -- resolve to a full URL.
export function assetUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${ASSET_URL}${path.startsWith('/') ? '' : '/'}${path}`;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}
