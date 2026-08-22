import { Injectable, Logger } from '@nestjs/common';
import { assertPublicHttpUrl, UnsafeUrlError } from '../common/utils/url-safety.util';

export interface LinkPreview {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
}

const FETCH_TIMEOUT_MS = 5000;
const MAX_BYTES = 300_000; // enough for meta tags on virtually any real page, small enough to bound memory
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;

function metaContent(html: string, ...patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match?.[1]) return decodeHtmlEntities(match[1].trim());
  }
  return null;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'");
}

// Matches <meta property="og:title" content="..."> in either attribute order, single or double
// quotes -- real-world HTML is inconsistent about this and we have no DOM parser here.
function ogPattern(property: string): RegExp[] {
  return [
    new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${property}["']`, 'i'),
  ];
}

@Injectable()
export class LinkPreviewService {
  private readonly logger = new Logger(LinkPreviewService.name);
  private readonly cache = new Map<string, { data: LinkPreview; expiresAt: number }>();

  async getPreview(rawUrl: string): Promise<LinkPreview> {
    const cached = this.cache.get(rawUrl);
    if (cached && cached.expiresAt > Date.now()) return cached.data;

    const url = await assertPublicHttpUrl(rawUrl).catch((err) => {
      if (err instanceof UnsafeUrlError) throw err;
      throw new UnsafeUrlError('تعذّر تحليل الرابط');
    });

    const html = await this.fetchBounded(url);
    const data: LinkPreview = {
      url: rawUrl,
      title: metaContent(html, ...ogPattern('og:title')) ?? metaContent(html, /<title[^>]*>([^<]*)<\/title>/i),
      description: metaContent(html, ...ogPattern('og:description'), ...ogPattern('description')),
      image: metaContent(html, ...ogPattern('og:image')),
      siteName: metaContent(html, ...ogPattern('og:site_name')) ?? url.hostname,
    };

    this.cacheSet(rawUrl, data);
    return data;
  }

  private cacheSet(key: string, data: LinkPreview) {
    if (this.cache.size >= CACHE_MAX_ENTRIES) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
  }

  // Fetches with a timeout, refuses redirects (each would need its own SSRF check -- simplest
  // safe behavior is to not follow them), and stops reading once MAX_BYTES is hit rather than
  // trusting Content-Length.
  private async fetchBounded(url: URL): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        redirect: 'manual',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; CollegeSocialLinkPreview/1.0)',
          Accept: 'text/html',
        },
      });
      if (res.status >= 300 && res.status < 400) {
        throw new UnsafeUrlError('لا يمكن معاينة رابط يعيد التوجيه');
      }
      if (!res.ok) throw new UnsafeUrlError('تعذّر جلب الرابط');

      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.includes('text/html')) throw new UnsafeUrlError('نوع المحتوى غير مدعوم');

      const reader = res.body?.getReader();
      if (!reader) return '';
      const chunks: Uint8Array[] = [];
      let received = 0;
      while (received < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.byteLength;
      }
      await reader.cancel().catch(() => undefined);
      return Buffer.concat(chunks).toString('utf-8');
    } catch (err) {
      if (err instanceof UnsafeUrlError) throw err;
      this.logger.debug(`link preview fetch failed for ${url.hostname}: ${(err as Error).message}`);
      throw new UnsafeUrlError('تعذّر جلب الرابط');
    } finally {
      clearTimeout(timeout);
    }
  }
}
