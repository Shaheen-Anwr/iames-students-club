// Building blocks for sharing app content (groups, posts, profiles, reels) to the outside world --
// WhatsApp, Facebook, Telegram, X, email, or the OS share sheet. Kept framework-agnostic; the UI
// lives in components/shared/ShareSheet.tsx.

export interface ShareContent {
  /** Absolute or app-relative path, e.g. "/groups/abc" or a full https URL. */
  url: string;
  /** Short headline, used by native share + as the tweet/email subject. */
  title: string;
  /** Optional longer blurb (post excerpt, group description…). */
  text?: string;
}

/** Turn an app-relative path into an absolute URL against the current origin. No-op if already absolute. */
export function absoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const origin =
    typeof window !== 'undefined'
      ? window.location.origin
      : (process.env.NEXT_PUBLIC_SITE_URL ?? '');
  return `${origin}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
}

export interface ShareTarget {
  key: string;
  label: string;
  /** External URL that opens the platform's share/compose screen in a new tab. */
  href: (c: Required<Pick<ShareContent, 'url' | 'title'>> & { text?: string }) => string;
  /** Brand colour for the icon chip. */
  brand: string;
}

export const SHARE_TARGETS: ShareTarget[] = [
  {
    key: 'whatsapp',
    label: 'واتساب',
    brand: '#25D366',
    href: ({ url, title }) => `https://wa.me/?text=${encodeURIComponent(`${title}\n${url}`)}`,
  },
  {
    key: 'facebook',
    label: 'فيسبوك',
    brand: '#1877F2',
    href: ({ url }) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
  },
  {
    key: 'telegram',
    label: 'تيليجرام',
    brand: '#26A5E4',
    href: ({ url, title }) =>
      `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
  },
  {
    key: 'x',
    label: 'X',
    brand: '#0F1419',
    href: ({ url, title }) =>
      `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
  },
  {
    key: 'email',
    label: 'البريد',
    brand: '#6B7280',
    href: ({ url, title, text }) =>
      `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${text ? `${text}\n\n` : ''}${url}`)}`,
  },
];

/**
 * Try the OS-native share sheet. Returns 'shared' on success, 'unsupported' when the API is
 * missing, 'cancelled' when the user dismissed it. Callers fall back to the in-app ShareSheet
 * on 'unsupported'.
 */
export async function nativeShare(content: ShareContent): Promise<'shared' | 'cancelled' | 'unsupported'> {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
    return 'unsupported';
  }
  try {
    await navigator.share({
      title: content.title,
      text: content.text,
      url: absoluteUrl(content.url),
    });
    return 'shared';
  } catch (err) {
    // AbortError == user closed the sheet; anything else we also treat as "handled" to avoid a
    // confusing double-fallback.
    return (err as Error)?.name === 'AbortError' ? 'cancelled' : 'cancelled';
  }
}

export async function copyToClipboard(value: string): Promise<boolean> {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    /* fall through to legacy path */
  }
  try {
    const el = document.createElement('textarea');
    el.value = value;
    el.setAttribute('readonly', '');
    el.style.position = 'absolute';
    el.style.left = '-9999px';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}
