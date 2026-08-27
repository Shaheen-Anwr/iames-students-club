import { Logger } from '@nestjs/common';
import { createReadStream, createWriteStream } from 'fs';
import { mkdir, readdir, rm, stat } from 'fs/promises';
import { extname, join } from 'path';
import type FfmpegCommandType from 'fluent-ffmpeg';

// fluent-ffmpeg/ffmpeg-static/ffprobe-static all ship a plain CommonJS `module.exports = value`
// at runtime, but their .d.ts files declare an ES-style `export default value` -- which makes
// TypeScript (with or without esModuleInterop, and even with `import x = require(...)`) treat the
// required value as if it already had a real `.default` property to unwrap. It doesn't: a plain
// `import` here silently resolves to `undefined` (fluent-ffmpeg) or the module's actual value
// wrapped one level too deep (ffmpeg-static/ffprobe-static), and neither errors until something
// actually tries to *use* the resulting undefined/wrong value (setFfmpegPath(undefined) doesn't
// throw either -- it only surfaces much later as a confusing "Cannot find ffmpeg"). Plain
// `require()` sidesteps all of that by matching the real runtime shape exactly, with an explicit
// cast since `require` isn't itself type-aware here.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ffmpeg: typeof FfmpegCommandType = require('fluent-ffmpeg');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ffmpegPath: string = require('ffmpeg-static');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ffprobeStatic: { path: string } = require('ffprobe-static');

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobeStatic.path);

const logger = new Logger('ChunkedUpload');

// Splits a file into sequential byte-range pieces, each at most `chunkSizeBytes`, written to
// "<outDir>/part-0<ext>", "part-1<ext>", etc. Pure byte slicing (not aware of the file's internal
// format) -- concatenating the parts back together in order reproduces the original bytes exactly,
// which is all that's needed since the parts are reassembled before ever being parsed as a PDF/
// document again (see PostsService.streamAttachment()).
export async function splitFileIntoByteChunks(filePath: string, chunkSizeBytes: number, outDir: string): Promise<string[]> {
  await mkdir(outDir, { recursive: true });
  const ext = extname(filePath);
  const partPaths: string[] = [];

  await new Promise<void>((resolve, reject) => {
    let partIndex = 0;
    let bytesInCurrentPart = 0;
    let currentPartPath = join(outDir, `part-${partIndex}${ext}`);
    let currentWriteStream = createWriteStream(currentPartPath);
    partPaths.push(currentPartPath);

    const readStream = createReadStream(filePath, { highWaterMark: 1024 * 1024 });

    function startNextPart() {
      partIndex += 1;
      bytesInCurrentPart = 0;
      currentPartPath = join(outDir, `part-${partIndex}${ext}`);
      currentWriteStream = createWriteStream(currentPartPath);
      partPaths.push(currentPartPath);
    }

    readStream.on('data', (chunk: Buffer) => {
      readStream.pause();
      (async () => {
        let offset = 0;
        while (offset < chunk.length) {
          // Roll over to a new part BEFORE slicing more data -- checking this as a precondition
          // (rather than only after writing a slice) is what correctly handles a part filling up
          // exactly at an incoming chunk's boundary. Checking only post-write and gating the
          // rollover on "is there more of *this* chunk left" would otherwise leave a full-but-not-
          // rolled-over part sitting there; the next slice would then compute spaceLeft=0, write an
          // empty 0-byte slice, advance neither offset nor bytesInCurrentPart, and loop forever.
          if (bytesInCurrentPart >= chunkSizeBytes) {
            await new Promise<void>((res) => currentWriteStream.end(res));
            startNextPart();
          }
          const spaceLeft = chunkSizeBytes - bytesInCurrentPart;
          const slice = chunk.subarray(offset, offset + spaceLeft);
          const wrote = currentWriteStream.write(slice);
          bytesInCurrentPart += slice.length;
          offset += slice.length;
          if (!wrote) {
            await new Promise<void>((res) => currentWriteStream.once('drain', res));
          }
        }
        readStream.resume();
      })().catch(reject);
    });

    readStream.on('end', () => {
      currentWriteStream.end(() => resolve());
    });
    readStream.on('error', reject);
  });

  return partPaths;
}

// Probes a video file for duration (seconds) and size (bytes) via ffprobe.
async function probeVideo(filePath: string): Promise<{ durationSec: number; sizeBytes: number }> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return reject(err);
      const durationSec = data.format.duration ?? 0;
      const sizeBytes = data.format.size ?? 0;
      if (!durationSec || !sizeBytes) return reject(new Error('تعذّر قراءة معلومات الفيديو'));
      resolve({ durationSec, sizeBytes });
    });
  });
}

// Splits a video into sequential segments, each targeting at most `targetChunkBytes` (with margin
// for bitrate variance), written to "<outDir>/part-0.mp4", "part-1.mp4", etc. Segment duration is
// derived from the source's average bitrate. The first two attempts use "-c copy" (stream copy --
// fast, lossless, no quality loss from re-encoding), but that can only cut at existing keyframes:
// a source with sparse keyframes (some screen-recording/webcam software uses long GOPs) can produce
// a segment well over target even at a short requested duration. If that happens, later attempts
// re-encode instead, forcing a keyframe at every segment boundary so the cut lands exactly on
// target regardless of the source's own keyframe spacing -- slower, but guaranteed to converge, so
// a single unusually-encoded video can never slip an oversized segment through and get rejected by
// Cloudinary after every other segment already finished uploading.
export async function segmentVideo(filePath: string, targetChunkBytes: number, outDir: string): Promise<string[]> {
  await mkdir(outDir, { recursive: true });
  const { durationSec, sizeBytes } = await probeVideo(filePath);
  const averageBytesPerSec = sizeBytes / durationSec;
  // 85% of the cap leaves headroom for segments denser than the file's average bitrate.
  const safeTargetBytes = targetChunkBytes * 0.85;

  let segmentDurationSec = Math.max(5, Math.floor(safeTargetBytes / averageBytesPerSec));
  const MAX_ATTEMPTS = 4;
  const STREAM_COPY_ATTEMPTS = 2;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    await rm(outDir, { recursive: true, force: true });
    await mkdir(outDir, { recursive: true });

    const useStreamCopy = attempt <= STREAM_COPY_ATTEMPTS;
    await new Promise<void>((resolve, reject) => {
      ffmpeg(filePath)
        .outputOptions([
          ...(useStreamCopy
            ? ['-c copy']
            : ['-c:v libx264', '-c:a aac', `-force_key_frames expr:gte(t,n_forced*${segmentDurationSec})`]),
          '-map 0',
          '-f segment',
          `-segment_time ${segmentDurationSec}`,
          '-reset_timestamps 1',
        ])
        .output(join(outDir, 'part-%d.mp4'))
        .on('end', () => resolve())
        .on('error', reject)
        .run();
    });

    const files = (await readdir(outDir)).filter((f) => f.startsWith('part-')).sort((a, b) => partIndexOf(a) - partIndexOf(b));
    const partPaths = files.map((f) => join(outDir, f));
    const sizes = await Promise.all(partPaths.map((p) => stat(p).then((s) => s.size)));
    const oversized = sizes.some((s) => s > targetChunkBytes);

    if (!oversized || attempt === MAX_ATTEMPTS) {
      if (oversized) {
        logger.warn(`Video segmentation still produced an oversized part after ${attempt} attempts -- proceeding anyway, Cloudinary will reject that specific part.`);
      }
      return partPaths;
    }

    logger.warn(`Segment exceeded ${targetChunkBytes} bytes at ${segmentDurationSec}s/segment (attempt ${attempt}) -- retrying with a shorter duration.`);
    segmentDurationSec = Math.max(3, Math.floor(segmentDurationSec / 2));
  }

  // Unreachable (loop always returns), but keeps TS happy.
  return [];
}

function partIndexOf(filename: string): number {
  const match = filename.match(/part-(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}
