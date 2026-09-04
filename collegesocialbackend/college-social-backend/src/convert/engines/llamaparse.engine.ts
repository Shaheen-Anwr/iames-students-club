// High-fidelity PDF -> Word/PowerPoint recovery via LlamaParse (LlamaCloud). LlamaParse is an
// LLM-backed document parser that reads a PDF's *structure* -- heading levels, paragraphs, bullet
// lists, and above all tables as real row/column grids -- and, unlike Adobe's Export PDF, keeps
// Arabic / RTL runs and table cells in reading order instead of reversing them. We upload the PDF,
// poll the parse job, pull the structured JSON, and map every item onto the shared Block[] model
// so the existing RTL-aware blocksToDocx / blocksToPptx builders produce the file.
//
// Enabled only when LLAMAPARSE_API_KEY (or LLAMA_CLOUD_API_KEY) is set -- see .env.example. When
// unset this module is a no-op and engines/index.ts falls back to Adobe -> LibreOffice -> the flat
// pipeline. Free tier: 1000 pages/day, no card. https://cloud.llamaindex.ai
//
// Env is read lazily (same reason as adobe.engine.ts): this file is imported while Nest builds its
// DI graph, before ConfigModule.forRoot() has loaded .env.

import type { ProgressFn } from '../formats';
import type { Block } from './blocks';
import { blocksToDocx } from './docx.engine';
import { blocksToPptx } from './pptx.engine';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Logger } = require('@nestjs/common');
const logger = new Logger('LlamaParseEngine');

const BASE = (process.env.LLAMAPARSE_BASE_URL || 'https://api.cloud.llamaindex.ai').replace(/\/+$/, '');
const apiKey = (): string => process.env.LLAMAPARSE_API_KEY || process.env.LLAMA_CLOUD_API_KEY || '';

export function llamaParseAvailable(): boolean {
  return !!apiKey();
}

const POLL_INTERVAL_MS = 3000;
const POLL_MAX = 80; // ~4 min ceiling for a large document

interface LpItem {
  type?: string; // 'heading' | 'text' | 'table' | 'caption' | ...
  lvl?: number;
  value?: string;
  md?: string;
  rows?: unknown[][];
}
// Images are NOT items -- they're a sibling array per page (confirmed against the live API: no
// `items` entry ever has an image-ish `type`). `type: 'full_page_screenshot'` is a raster of the
// whole rendered page (one per page) and is skipped -- we already recover real text via `items`,
// so keeping it too would just duplicate every page as a giant background image. `layout_v3_image`
// is an individually-detected embedded picture/figure/logo and is what gets recovered.
interface LpImage {
  name?: string;
  type?: string;
  width?: number;
  height?: number;
}
interface LpPage {
  page?: number;
  items?: LpItem[];
  images?: LpImage[];
}

async function lp(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey()}`, Accept: 'application/json', ...(init?.headers ?? {}) },
  });
}

async function uploadAndParse(pdf: Buffer, onProgress: ProgressFn): Promise<{ id: string; pages: LpPage[] }> {
  const form = new FormData();
  // Copy into a fresh Uint8Array -- Node's Buffer type (Buffer<ArrayBufferLike>) isn't a valid
  // BlobPart under the DOM lib types; the copy is trivial for a <=25 MB conversion input.
  const bytes = new Uint8Array(pdf);
  form.append('file', new Blob([bytes], { type: 'application/pdf' }), 'input.pdf');

  const up = await lp('/api/parsing/upload', { method: 'POST', body: form });
  if (!up.ok) throw new Error(`upload ${up.status}: ${(await up.text().catch(() => '')).slice(0, 200)}`);
  const { id } = (await up.json()) as { id?: string };
  if (!id) throw new Error('upload returned no job id');
  onProgress(38, 'تحليل بنية المستند');

  for (let i = 0; i < POLL_MAX; i += 1) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    let status: string | undefined;
    try {
      const st = await lp(`/api/parsing/job/${id}`);
      if (!st.ok) continue; // transient blip -- keep polling
      ({ status } = (await st.json().catch(() => ({}))) as { status?: string });
    } catch {
      continue; // network hiccup mid-job -- don't abort a parse that may still finish
    }
    if (status === 'SUCCESS') {
      onProgress(72, 'استخراج العناصر');
      const rj = await lp(`/api/parsing/job/${id}/result/json`);
      if (!rj.ok) throw new Error(`result ${rj.status}`);
      const body = (await rj.json()) as { pages?: LpPage[] };
      return { id, pages: body.pages ?? [] };
    }
    if (status && status !== 'PENDING' && status !== 'PROCESSING' && status !== 'RUNNING') {
      throw new Error(`job ${status}`);
    }
    onProgress(Math.min(68, 38 + i * 2), 'تحليل بنية المستند');
  }
  throw new Error('parse timed out');
}

// LlamaParse heading `value`s and cells can carry inline markup ("<u>x</u>", "**x**", links).
// Blocks are plain text, so flatten it.
function flatten(s: string): string {
  return String(s ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

// A page with dozens of individually-detected regions (rare -- a densely illustrated page) is
// capped so one pathological page can't blow up conversion time with sequential downloads.
const MAX_IMAGES_PER_PAGE = 12;

async function fetchImage(jobId: string, name: string): Promise<Buffer | null> {
  try {
    const res = await lp(`/api/parsing/job/${jobId}/result/image/${name}`);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null; // best-effort -- a failed image fetch shouldn't fail the whole conversion
  }
}

async function pagesToBlocks(jobId: string, pages: LpPage[]): Promise<Block[]> {
  const blocks: Block[] = [];
  for (const [idx, pg] of pages.entries()) {
    if (idx > 0) blocks.push({ type: 'pagebreak' });
    for (const it of pg.items ?? []) {
      if (it.type === 'heading') {
        const text = flatten(it.value || it.md || '');
        if (text) {
          const level = Math.min(3, Math.max(1, Math.round(it.lvl || 1))) as 1 | 2 | 3;
          blocks.push({ type: 'heading', level, text });
        }
        continue;
      }
      if (it.type === 'table' && Array.isArray(it.rows) && it.rows.length) {
        const rows = it.rows
          .map((r) => (Array.isArray(r) ? r.map((c) => flatten(String(c ?? ''))) : []))
          .filter((r) => r.some(Boolean));
        if (rows.length) blocks.push({ type: 'table', header: true, rows });
        continue;
      }
      // 'text' / 'caption' / untyped: a paragraph, or a markdown bullet / numbered list.
      const raw = it.value || it.md || '';
      for (const line of raw.split(/\r?\n/)) {
        const t = line.trim();
        if (!t) continue;
        const m = t.match(/^([-*+]|\d+[.)])\s+(.+)$/);
        if (m) {
          const text = flatten(m[2]);
          if (text) blocks.push({ type: 'bullet', depth: 0, text });
        } else {
          const text = flatten(t);
          if (text) blocks.push({ type: 'para', text });
        }
      }
    }

    // Images live in a separate array, not `items` (see the LpImage comment above) -- appended
    // after this page's text since LlamaParse doesn't report where in the reading order they fall.
    const images = (pg.images ?? []).filter((im) => im.type !== 'full_page_screenshot' && im.name).slice(0, MAX_IMAGES_PER_PAGE);
    for (const im of images) {
      const data = await fetchImage(jobId, im.name!);
      if (!data) continue;
      blocks.push({ type: 'image', data, mimeType: 'image/jpeg', widthPt: im.width || 100, heightPt: im.height || 100 });
    }
  }
  return blocks;
}

// PDF bytes -> converted .docx / .pptx. Throws on any failure so the caller can fall through to the
// next engine.
export async function runViaLlamaParse(
  pdf: Buffer,
  target: 'docx' | 'pptx',
  onProgress: ProgressFn,
): Promise<Buffer> {
  onProgress(22, 'رفع الملف إلى محرّك التحليل');
  const { id, pages } = await uploadAndParse(pdf, onProgress);
  const blocks = await pagesToBlocks(id, pages);
  if (!blocks.some((b) => b.type !== 'pagebreak')) throw new Error('no content recovered');
  onProgress(86, `إنشاء ملف ${target.toUpperCase()}`);
  const out = target === 'docx' ? await blocksToDocx(blocks) : await blocksToPptx(blocks);
  logger.log(
    `LlamaParse pdf->${target} ok (${out.length}b, ${blocks.length} blocks over ${pages.length} page(s))`,
  );
  return out;
}
