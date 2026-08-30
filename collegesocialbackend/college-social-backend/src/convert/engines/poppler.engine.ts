// PDF -> text via Poppler's `pdftotext`, used automatically whenever that binary is present. It
// has a mature text-extraction + bidi pass and reads Arabic PDFs (including fake-bold overprinted
// ones) far more reliably than any pure-JS reader -- it was the difference between garbled and
// clean output on real lecture PDFs. Falls back to the pdfjs reader when `pdftotext` isn't there
// (e.g. Render's plain Node runtime).

import { execFile } from 'child_process';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';

const run = promisify(execFile);
const PDFTOTEXT = process.env.PDFTOTEXT_PATH || 'pdftotext';

let available: boolean | null = null;
export async function pdftotextAvailable(): Promise<boolean> {
  if (available === null) {
    try {
      await run(PDFTOTEXT, ['-v'], { timeout: 10_000 });
      available = true;
    } catch {
      available = false;
    }
  }
  return available;
}

// Bidi/embedding control marks pdftotext wraps around runs.
const BIDI_CONTROLS = /[‎‏‪-‮⁦-⁩؜]/g;
// Glyphs from symbol/icon fonts that have no real text mapping: arrows, dingbats, geometric
// shapes, private-use area, replacement char.
const SYMBOL_GLYPHS = /[←-⇿⌀-⏿■-➿⬀-⯿-￼�]/g;
// Material Symbols / Icons render as their ligature name in the text layer. Drop any
// underscore-joined token, plus these common single-word icon names when they stand alone.
const ICON_TOKEN = /(^|\s)[a-z][a-z]*(?:_[a-z]+)+(?=\s|$)/g;
const ICON_WORD_LIST = [
  'school', 'groups', 'group', 'person', 'settings', 'menu', 'close', 'search', 'star', 'stars',
  'home', 'work', 'business', 'description', 'lightbulb', 'psychology', 'warning', 'info', 'help',
  'lock', 'verified', 'check', 'done', 'add', 'edit', 'delete', 'folder', 'link', 'language',
  'public', 'flag', 'bolt', 'insights', 'analytics', 'leaderboard', 'campaign', 'handshake',
  'diversity', 'balance', 'target', 'rocket', 'trophy', 'gavel', 'hub', 'timeline', 'checklist',
];
// Match an icon name whether it stands alone or is glued to Arabic ("flagالهدف"): no ASCII letter
// on either side, but Arabic/space/edge is fine.
const ICON_WORD_RE = new RegExp(`(?<![a-z])(?:${ICON_WORD_LIST.join('|')})(?![a-z])`, 'gi');
const LONE_ASCII_LINE = /^[\x00-\x7F\s]*$/;

export async function pdfToTextViaPoppler(input: Buffer): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ptt-'));
  const src = join(dir, 'in.pdf');
  await writeFile(src, input);
  try {
    // Default (not -layout / -raw): pdftotext's bidi-aware reading-order pass. On real Arabic
    // lecture decks -layout interleaves columns and -raw reverses word order; plain default keeps
    // Arabic word order and structure intact. -nodiag drops rotated watermark text.
    await run(PDFTOTEXT, ['-nodiag', '-enc', 'UTF-8', src, join(dir, 'out.txt')], {
      timeout: 120_000,
      maxBuffer: 32 * 1024 * 1024,
    });
    const raw = await readFile(join(dir, 'out.txt'), 'utf8');
    return normalize(raw);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function stripIcons(line: string): string {
  return line
    .replace(SYMBOL_GLYPHS, ' ')
    .replace(ICON_TOKEN, '$1')
    .replace(ICON_WORD_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalize(raw: string): string {
  return raw
    .replace(BIDI_CONTROLS, '')
    .split(/\f/) // form-feed = page break
    .map((page) =>
      page
        .split('\n')
        .map((l) => stripIcons(l))
        .filter((l) => l && !LONE_ASCII_LINE.test(l)) // drop icon-only / page-number-only lines
        .join('\n'),
    )
    .join('\n\f\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
