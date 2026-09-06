// PDF compression via headless Ghostscript, used automatically whenever the `gs` binary is present
// -- same "detect once, spawn on demand" shape as libreoffice.engine.ts. `gs`'s `pdfwrite` device
// recompresses embedded raster images (downsampling + re-encoding); it never touches text/glyph
// operators or ToUnicode CMaps, so it's safe to run on output this app has already hardened for
// Arabic text fidelity. Falls back to Adobe's CompressPDFJob when `gs` isn't installed (e.g. the
// Docker image doesn't have it yet -- see the Dockerfile comment).

import { execFile } from 'child_process';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';

const run = promisify(execFile);

const GS = process.env.GHOSTSCRIPT_PATH || 'gs';
const JOB_TIMEOUT_MS = Number(process.env.GHOSTSCRIPT_TIMEOUT_MS) || 120_000;

export type CompressLevel = 'low' | 'medium' | 'high';

// Ghostscript's built-in PDFSETTINGS presets. Named "quality tiers" here match the direction a user
// expects: 'high' compression = smaller file = /screen (72dpi images); 'low' compression = larger
// file, better quality = /printer.
const PRESET: Record<CompressLevel, string> = {
  low: '/printer',
  medium: '/ebook',
  high: '/screen',
};

let available: boolean | null = null;

export async function gsAvailable(): Promise<boolean> {
  if (available === null) {
    try {
      await run(GS, ['--version'], { timeout: 10_000 });
      available = true;
    } catch {
      available = false;
    }
  }
  return available;
}

export async function compressPdfViaGhostscript(input: Buffer, level: CompressLevel): Promise<Buffer> {
  const work = await mkdtemp(join(tmpdir(), 'gs-'));
  try {
    const inPath = join(work, 'in.pdf');
    const outPath = join(work, 'out.pdf');
    await writeFile(inPath, input);
    await run(
      GS,
      [
        '-sDEVICE=pdfwrite',
        '-dCompatibilityLevel=1.4',
        `-dPDFSETTINGS=${PRESET[level]}`,
        '-dNOPAUSE',
        '-dBATCH',
        '-dQUIET',
        '-dSAFER',
        `-sOutputFile=${outPath}`,
        inPath,
      ],
      { timeout: JOB_TIMEOUT_MS, killSignal: 'SIGKILL', maxBuffer: 8 * 1024 * 1024 },
    );
    const out = await readFile(outPath);
    if (!out.length) throw new Error('Ghostscript produced an empty file');
    return out;
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => undefined);
  }
}
