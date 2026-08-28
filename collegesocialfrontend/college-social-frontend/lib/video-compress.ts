'use client';

// Best-effort, in-browser video shrink that runs BEFORE upload. It re-encodes the video track to a
// smaller H.264 stream (long edge capped, lower bitrate) and passes the original AAC audio through
// untouched, using the native WebCodecs API (hardware-accelerated where available) plus mp4box for
// demuxing and mp4-muxer for re-muxing. Both libraries are dynamically imported, so nothing here is
// in the initial bundle -- the ~300KB of demux/mux code only loads the first time someone actually
// picks a large video.
//
// This is purely an optimisation: it means the file that reaches the server is already small, so
// the server doesn't have to spend request time transcoding it (see the backend's
// StorageService.uploadChunkedVideo, which still compresses anything that slips through). EVERY
// failure path here -- unsupported browser, exotic codec, decode error, a result that isn't
// actually smaller -- resolves to `{ file: <original>, compressed: false }` and lets the server
// handle it. It never throws except on a caller-triggered abort.
//
// Known limitations (all fall back to the original file, never corrupt output):
//   - ISO-BMFF input only (.mp4/.m4v/.mov). WebM/MKV are passed straight through.
//   - Audio must be AAC (the norm for phone/screen recordings). Non-AAC audio -> passed through.
//   - Needs a secure context (https/localhost) and a browser with VideoEncoder/VideoDecoder
//     (Chrome/Edge 94+, Safari 16.4+, Firefox 130+).

export interface CompressOptions {
  /** Cap on the longer edge of the output, in px. Default 1280 (720p-ish). */
  maxDimension?: number;
  /** Files smaller than this are returned untouched. Default 40 MB. */
  minBytesToBother?: number;
  /** Files larger than this are returned untouched (server transcodes instead). Default ~1.2 GB. */
  maxBytesToBother?: number;
  /** 0..1 progress as frames are processed. */
  onProgress?: (fraction: number) => void;
  /** Abort the transcode; makes the returned promise reject with the abort reason. */
  signal?: AbortSignal;
}

export interface CompressResult {
  file: File;
  compressed: boolean;
}

const READ_CHUNK_BYTES = 16 * 1024 * 1024;

export function isClientVideoCompressionSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    typeof VideoEncoder !== 'undefined' &&
    typeof VideoDecoder !== 'undefined' &&
    typeof VideoFrame !== 'undefined' &&
    typeof OffscreenCanvas !== 'undefined'
  );
}

export async function maybeCompressVideo(file: File, opts: CompressOptions = {}): Promise<CompressResult> {
  const minBytes = opts.minBytesToBother ?? 40 * 1024 * 1024;
  // The demuxer keeps the whole file in memory during the parse phase, so past a point the safer
  // move is to just upload and let the server transcode it rather than risk an out-of-memory tab.
  const maxBytes = opts.maxBytesToBother ?? 1_200 * 1024 * 1024;
  const isIsoBmff = /\.(mp4|m4v|mov)$/i.test(file.name) || /(mp4|quicktime)/i.test(file.type);

  if (
    !file.type.startsWith('video/') ||
    file.size < minBytes ||
    file.size > maxBytes ||
    !isIsoBmff ||
    !isClientVideoCompressionSupported()
  ) {
    return { file, compressed: false };
  }

  try {
    const out = await transcode(file, opts);
    // Only take the re-encoded file if it's a clear win -- a small saving isn't worth handing the
    // server a file that went through a lossy pass.
    if (out && out.size > 0 && out.size < file.size * 0.9) {
      return { file: out, compressed: true };
    }
    return { file, compressed: false };
  } catch (err) {
    if (opts.signal?.aborted) throw err;
    // eslint-disable-next-line no-console
    console.warn('[video-compress] using original file, in-browser compression failed:', err);
    return { file, compressed: false };
  }
}

function targetBitrate(height: number): number {
  if (height >= 1080) return 4_000_000;
  if (height >= 720) return 2_200_000;
  if (height >= 480) return 1_200_000;
  return 700_000;
}

async function pickAvcCodec(width: number, height: number, bitrate: number): Promise<string> {
  const candidates = ['avc1.640028', 'avc1.4d0028', 'avc1.42e01f', 'avc1.42001f'];
  for (const codec of candidates) {
    try {
      const { supported } = await VideoEncoder.isConfigSupported({ codec, width, height, bitrate });
      if (supported) return codec;
    } catch {
      /* try next */
    }
  }
  throw new Error('no supported H.264 encoder configuration');
}

// Pulls the codec-private data (avcC / hvcC box, minus its 8-byte header) out of the sample
// description -- VideoDecoder.configure() needs it as `description` for AVC/HEVC.
function videoDescription(mp4boxFile: any, DataStream: any, trackId: number): Uint8Array | undefined {
  const trak = mp4boxFile.getTrackById(trackId);
  for (const entry of trak?.mdia?.minf?.stbl?.stsd?.entries ?? []) {
    const box = entry.avcC ?? entry.hvcC;
    if (!box) continue;
    const stream = new DataStream(undefined, 0, DataStream.BIG_ENDIAN);
    box.write(stream);
    return new Uint8Array(stream.buffer, 8); // strip the box size+type header
  }
  return undefined;
}

// Scans a serialised `esds` box for the DecoderSpecificInfo (tag 0x05) -- that payload is the
// AudioSpecificConfig the muxer needs to describe an AAC track. Returns undefined if it can't be
// found, which makes the caller skip client-side compression rather than emit a broken audio track.
function audioSpecificConfig(mp4boxFile: any, DataStream: any, trackId: number): Uint8Array | undefined {
  const trak = mp4boxFile.getTrackById(trackId);
  for (const entry of trak?.mdia?.minf?.stbl?.stsd?.entries ?? []) {
    if (!entry.esds) continue;
    const stream = new DataStream(undefined, 0, DataStream.BIG_ENDIAN);
    entry.esds.write(stream);
    const bytes = new Uint8Array(stream.buffer);
    for (let i = 0; i < bytes.length; i += 1) {
      if (bytes[i] !== 0x05) continue;
      let j = i + 1;
      let len = 0;
      for (let k = 0; k < 4; k += 1) {
        const b = bytes[j];
        j += 1;
        len = (len << 7) | (b & 0x7f);
        if (!(b & 0x80)) break;
      }
      if (len > 0 && j + len <= bytes.length) return bytes.slice(j, j + len);
    }
  }
  return undefined;
}

function rotationFromMatrix(matrix: number[] | undefined): 0 | 90 | 180 | 270 {
  if (!matrix || matrix.length < 5) return 0;
  const a = matrix[0] / 65536;
  const b = matrix[1] / 65536;
  const deg = ((Math.round((Math.atan2(b, a) * 180) / Math.PI) % 360) + 360) % 360;
  return deg === 90 || deg === 180 || deg === 270 ? deg : 0;
}

async function transcode(file: File, opts: CompressOptions): Promise<File | null> {
  const { signal } = opts;
  const throwIfAborted = () => {
    if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
  };

  const [mp4boxMod, muxerMod] = await Promise.all([
    import('mp4box') as Promise<any>,
    import('mp4-muxer') as Promise<any>,
  ]);
  const MP4Box = mp4boxMod.default ?? mp4boxMod;
  const { Muxer, ArrayBufferTarget } = muxerMod;
  const DataStream = MP4Box.DataStream;
  if (!MP4Box?.createFile || !DataStream) throw new Error('mp4box failed to load');

  const mp4 = MP4Box.createFile();

  // Feed the whole file in first (16 MB reads), THEN wait for the moov to be parsed. flush() forces
  // onReady even for non-fast-start files whose moov sits at the end. Waiting for feeding to finish
  // before reading `info` also avoids a race on fast-start files, where onReady fires mid-feed.
  const readyPromise = new Promise<any>((resolve, reject) => {
    mp4.onReady = resolve;
    mp4.onError = (e: any) => reject(new Error(`mp4box: ${e}`));
  });

  for (let pos = 0; pos < file.size; pos += READ_CHUNK_BYTES) {
    throwIfAborted();
    const buf = (await file.slice(pos, pos + READ_CHUNK_BYTES).arrayBuffer()) as any;
    buf.fileStart = pos;
    mp4.appendBuffer(buf);
  }
  mp4.flush();

  const info: any = await readyPromise;

  const videoTrack = info.videoTracks?.[0];
  if (!videoTrack) throw new Error('no video track');
  const audioTrack = info.audioTracks?.[0];
  const audioIsAac = !!audioTrack && /mp4a/i.test(audioTrack.codec);

  const srcW = videoTrack.video?.width || videoTrack.track_width;
  const srcH = videoTrack.video?.height || videoTrack.track_height;
  if (!srcW || !srcH) throw new Error('unknown video dimensions');

  const maxDim = opts.maxDimension ?? 1280;
  const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
  const outW = Math.max(2, Math.round((srcW * scale) / 2) * 2);
  const outH = Math.max(2, Math.round((srcH * scale) / 2) * 2);

  const durationSec = videoTrack.movie_duration / videoTrack.movie_timescale || videoTrack.duration / videoTrack.timescale;
  const fps = Math.min(60, Math.max(1, Math.round((videoTrack.nb_samples || 1) / (durationSec || 1))));
  const bitrate = targetBitrate(outH);
  const keyEvery = Math.max(1, fps * 2);

  const description = videoDescription(mp4, DataStream, videoTrack.id);
  let audioDescription: Uint8Array | undefined;
  if (audioIsAac) {
    audioDescription = audioSpecificConfig(mp4, DataStream, audioTrack.id);
  }
  const muxAudio = audioIsAac && !!audioDescription;

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
    // No `frameRate` here on purpose -- we forward each frame's real timestamp, so the track stays
    // variable-frame-rate-safe instead of being rounded to a nominal fps.
    video: { codec: 'avc', width: outW, height: outH, rotation: rotationFromMatrix(videoTrack.matrix) },
    ...(muxAudio
      ? { audio: { codec: 'aac', numberOfChannels: audioTrack.audio.channel_count, sampleRate: audioTrack.audio.sample_rate } }
      : {}),
  });

  let pipelineError: unknown;
  const canvas = new OffscreenCanvas(outW, outH);
  const ctx = canvas.getContext('2d', { alpha: false })!;
  const totalFrames = videoTrack.nb_samples || 0;
  let encodedFrames = 0;

  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      try {
        muxer.addVideoChunk(chunk, meta);
      } catch (e) {
        pipelineError ??= e;
      }
    },
    error: (e) => {
      pipelineError ??= e;
    },
  });
  encoder.configure({
    codec: await pickAvcCodec(outW, outH, bitrate),
    width: outW,
    height: outH,
    bitrate,
    framerate: fps,
    latencyMode: 'quality',
  });

  const decoder = new VideoDecoder({
    output: (frame) => {
      try {
        ctx.drawImage(frame, 0, 0, outW, outH);
        const timestamp = frame.timestamp;
        frame.close();
        const outFrame = new VideoFrame(canvas, { timestamp });
        encoder.encode(outFrame, { keyFrame: encodedFrames % keyEvery === 0 });
        outFrame.close();
        encodedFrames += 1;
        if (totalFrames) opts.onProgress?.(Math.min(0.99, encodedFrames / totalFrames));
      } catch (e) {
        pipelineError ??= e;
      }
    },
    error: (e) => {
      pipelineError ??= e;
    },
  });
  decoder.configure({ codec: videoTrack.codec, description, codedWidth: srcW, codedHeight: srcH });

  // Replay the samples mp4box already parsed. It calls onSamples synchronously from start(), so by
  // the time start() returns every sample has been queued into the decoder / muxer; WebCodecs' own
  // queues provide the backpressure and decoder.flush() below drains the rest.
  mp4.onSamples = (trackId: number, _ref: unknown, samples: any[]) => {
    if (pipelineError) return;
    for (const s of samples) {
      const tsUs = (1e6 * s.cts) / s.timescale;
      const durUs = (1e6 * s.duration) / s.timescale;
      if (trackId === videoTrack.id) {
        decoder.decode(new EncodedVideoChunk({ type: s.is_sync ? 'key' : 'delta', timestamp: tsUs, duration: durUs, data: s.data }));
      } else if (muxAudio && trackId === audioTrack.id) {
        muxer.addAudioChunkRaw(s.data, 'key', tsUs, durUs, {
          decoderConfig: {
            codec: audioTrack.codec,
            numberOfChannels: audioTrack.audio.channel_count,
            sampleRate: audioTrack.audio.sample_rate,
            description: audioDescription,
          },
        } as any);
      }
    }
    const last = samples[samples.length - 1];
    if (last?.number != null) mp4.releaseUsedSamples(trackId, last.number);
  };

  mp4.setExtractionOptions(videoTrack.id, null, { nbSamples: 200 });
  if (muxAudio) mp4.setExtractionOptions(audioTrack.id, null, { nbSamples: 500 });
  mp4.start();

  throwIfAborted();
  if (pipelineError) throw pipelineError;

  await decoder.flush();
  await encoder.flush();
  if (pipelineError) throw pipelineError;
  muxer.finalize();

  encoder.close();
  decoder.close();
  opts.onProgress?.(1);

  const outName = file.name.replace(/\.[^./\\]+$/, '') + '.mp4';
  return new File([target.buffer], outName, { type: 'video/mp4' });
}

export interface SegmentOptions extends CompressOptions {
  /**
   * Target ceiling for each produced segment, in bytes. The re-encoded stream is cut on keyframe
   * boundaries so every piece lands under this (a small safety margin is applied on top). Defaults
   * to 95 decimal MB -- Cloudinary's free-tier per-video-asset cap.
   */
  maxPieceBytes?: number;
}

// Re-encodes a video the same way `transcode` does (H.264 long-edge-capped + AAC pass-through) but
// writes the result as SEVERAL smaller .mp4 files instead of one, each below `maxPieceBytes`, cut on
// keyframe boundaries so every piece is independently playable. Used when a single video is larger
// than Cloudinary will accept as one asset: the browser uploads each segment directly and the
// backend stitches them back into one continuous delivery URL (fl_splice). Segment length is derived
// from the target encode bitrate; a keyframe is forced at every cut so the split lands where we want
// regardless of the source's own GOP structure.
//
// Throws on anything it can't handle cleanly (unsupported browser, non-AAC audio it can't describe,
// decode error, caller abort) -- the caller is expected to fall back to the server upload route,
// which segments with ffmpeg instead.
export async function segmentVideo(file: File, opts: SegmentOptions = {}): Promise<File[]> {
  const maxPieceBytes = opts.maxPieceBytes ?? 95 * 1_000_000;
  // The whole source sits in memory (demuxer) alongside the re-encoded output during this pass, so
  // past this size the safer move is to let the server segment with ffmpeg instead of risking an
  // out-of-memory tab. The caller treats a throw here as "fall back to the server route".
  const maxInputBytes = opts.maxBytesToBother ?? 700 * 1024 * 1024;
  const isIsoBmff = /\.(mp4|m4v|mov)$/i.test(file.name) || /(mp4|quicktime)/i.test(file.type);

  if (!file.type.startsWith('video/') || !isIsoBmff || !isClientVideoCompressionSupported()) {
    throw new Error('client video segmentation not supported for this file/browser');
  }
  if (file.size > maxInputBytes) {
    throw new Error('file too large to segment in-browser safely');
  }

  const { signal } = opts;
  const throwIfAborted = () => {
    if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
  };

  const [mp4boxMod, muxerMod] = await Promise.all([
    import('mp4box') as Promise<any>,
    import('mp4-muxer') as Promise<any>,
  ]);
  const MP4Box = mp4boxMod.default ?? mp4boxMod;
  const { Muxer, ArrayBufferTarget } = muxerMod;
  const DataStream = MP4Box.DataStream;
  if (!MP4Box?.createFile || !DataStream) throw new Error('mp4box failed to load');

  const mp4 = MP4Box.createFile();
  const readyPromise = new Promise<any>((resolve, reject) => {
    mp4.onReady = resolve;
    mp4.onError = (e: any) => reject(new Error(`mp4box: ${e}`));
  });
  for (let pos = 0; pos < file.size; pos += READ_CHUNK_BYTES) {
    throwIfAborted();
    const buf = (await file.slice(pos, pos + READ_CHUNK_BYTES).arrayBuffer()) as any;
    buf.fileStart = pos;
    mp4.appendBuffer(buf);
  }
  mp4.flush();
  const info: any = await readyPromise;

  const videoTrack = info.videoTracks?.[0];
  if (!videoTrack) throw new Error('no video track');
  const audioTrack = info.audioTracks?.[0];
  const audioIsAac = !!audioTrack && /mp4a/i.test(audioTrack.codec);

  const srcW = videoTrack.video?.width || videoTrack.track_width;
  const srcH = videoTrack.video?.height || videoTrack.track_height;
  if (!srcW || !srcH) throw new Error('unknown video dimensions');

  const maxDim = opts.maxDimension ?? 1280;
  const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
  const outW = Math.max(2, Math.round((srcW * scale) / 2) * 2);
  const outH = Math.max(2, Math.round((srcH * scale) / 2) * 2);

  const durationSec =
    videoTrack.movie_duration / videoTrack.movie_timescale || videoTrack.duration / videoTrack.timescale;
  const fps = Math.min(60, Math.max(1, Math.round((videoTrack.nb_samples || 1) / (durationSec || 1))));
  const bitrate = targetBitrate(outH);
  const keyEvery = Math.max(1, fps * 2);

  const description = videoDescription(mp4, DataStream, videoTrack.id);
  let audioDescription: Uint8Array | undefined;
  if (audioIsAac) audioDescription = audioSpecificConfig(mp4, DataStream, audioTrack.id);
  const muxAudio = audioIsAac && !!audioDescription;
  const audioBytesPerSec = muxAudio ? 128_000 / 8 : 0;

  // How many seconds of output fit under the per-piece cap, at the bitrate we're about to encode at.
  // 0.82 leaves room for the encoder running hot on a high-motion stretch and for container
  // overhead; the caller's confirm step tolerates a little more, and a piece that still overshoots
  // just gets rejected by Cloudinary and triggers the server fallback -- it can't corrupt anything.
  const bytesPerSec = bitrate / 8 + audioBytesPerSec;
  const segSec = Math.max(4, Math.floor((maxPieceBytes * 0.82) / bytesPerSec));

  const videoChunks: { chunk: any; meta: any; tsUs: number; isKey: boolean }[] = [];
  const audioChunks: { data: Uint8Array; tsUs: number; durUs: number }[] = [];
  let firstMetaWithConfig: any;
  let pipelineError: unknown;

  const canvas = new OffscreenCanvas(outW, outH);
  const ctx = canvas.getContext('2d', { alpha: false })!;
  const totalFrames = videoTrack.nb_samples || 0;
  let decodedFrames = 0;
  let forcedBoundaryIndex = 0;

  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      try {
        if (meta?.decoderConfig && !firstMetaWithConfig) firstMetaWithConfig = meta;
        videoChunks.push({ chunk, meta, tsUs: chunk.timestamp, isKey: chunk.type === 'key' });
      } catch (e) {
        pipelineError ??= e;
      }
    },
    error: (e) => {
      pipelineError ??= e;
    },
  });
  encoder.configure({
    codec: await pickAvcCodec(outW, outH, bitrate),
    width: outW,
    height: outH,
    bitrate,
    framerate: fps,
    latencyMode: 'quality',
  });

  const decoder = new VideoDecoder({
    output: (frame) => {
      try {
        ctx.drawImage(frame, 0, 0, outW, outH);
        const timestamp = frame.timestamp;
        frame.close();
        const outFrame = new VideoFrame(canvas, { timestamp });
        // Force a keyframe at the normal cadence AND at every segment boundary, so a clean cut point
        // always exists exactly where we want to split.
        const crossedBoundary = timestamp >= (forcedBoundaryIndex + 1) * segSec * 1_000_000;
        if (crossedBoundary) forcedBoundaryIndex += 1;
        encoder.encode(outFrame, { keyFrame: crossedBoundary || decodedFrames % keyEvery === 0 });
        outFrame.close();
        decodedFrames += 1;
        if (totalFrames) opts.onProgress?.(Math.min(0.95, decodedFrames / totalFrames));
      } catch (e) {
        pipelineError ??= e;
      }
    },
    error: (e) => {
      pipelineError ??= e;
    },
  });
  decoder.configure({ codec: videoTrack.codec, description, codedWidth: srcW, codedHeight: srcH });

  mp4.onSamples = (trackId: number, _ref: unknown, samples: any[]) => {
    if (pipelineError) return;
    for (const s of samples) {
      const tsUs = (1e6 * s.cts) / s.timescale;
      const durUs = (1e6 * s.duration) / s.timescale;
      if (trackId === videoTrack.id) {
        decoder.decode(
          new EncodedVideoChunk({ type: s.is_sync ? 'key' : 'delta', timestamp: tsUs, duration: durUs, data: s.data }),
        );
      } else if (muxAudio && trackId === audioTrack.id) {
        audioChunks.push({ data: new Uint8Array(s.data.slice(0)), tsUs, durUs });
      }
    }
    const last = samples[samples.length - 1];
    if (last?.number != null) mp4.releaseUsedSamples(trackId, last.number);
  };
  mp4.setExtractionOptions(videoTrack.id, null, { nbSamples: 200 });
  if (muxAudio) mp4.setExtractionOptions(audioTrack.id, null, { nbSamples: 500 });
  mp4.start();

  throwIfAborted();
  if (pipelineError) throw pipelineError;
  await decoder.flush();
  await encoder.flush();
  encoder.close();
  decoder.close();
  if (pipelineError) throw pipelineError;
  if (!videoChunks.length) throw new Error('no encoded video output');

  // Group the encoded chunks into segments: start a new one whenever the next keyframe lands past
  // the current segment's time budget. audioChunks land in whichever segment covers their timestamp.
  const cutIndices: number[] = [0];
  let segStartUs = videoChunks[0].tsUs;
  for (let i = 1; i < videoChunks.length; i += 1) {
    const c = videoChunks[i];
    if (c.isKey && c.tsUs - segStartUs >= segSec * 1_000_000) {
      cutIndices.push(i);
      segStartUs = c.tsUs;
    }
  }

  const baseName = file.name.replace(/\.[^./\\]+$/, '');
  const files: File[] = [];
  audioChunks.sort((a, b) => a.tsUs - b.tsUs);

  for (let seg = 0; seg < cutIndices.length; seg += 1) {
    throwIfAborted();
    const start = cutIndices[seg];
    const end = seg + 1 < cutIndices.length ? cutIndices[seg + 1] : videoChunks.length;
    const startUs = videoChunks[start].tsUs;
    const endUs = end < videoChunks.length ? videoChunks[end].tsUs : Infinity;

    const target = new ArrayBufferTarget();
    // firstTimestampBehavior:'offset' rebases each segment's own muxer so its first chunk lands at
    // t=0 -- that's how the piece becomes independently playable without cloning/reconstructing any
    // chunk. mp4-muxer copies each chunk's bytes synchronously inside addVideoChunk, so passing the
    // original EncodedVideoChunk straight through is safe.
    const muxer = new Muxer({
      target,
      fastStart: 'in-memory',
      firstTimestampBehavior: 'offset',
      video: { codec: 'avc', width: outW, height: outH, rotation: rotationFromMatrix(videoTrack.matrix) },
      ...(muxAudio
        ? { audio: { codec: 'aac', numberOfChannels: audioTrack.audio.channel_count, sampleRate: audioTrack.audio.sample_rate } }
        : {}),
    });

    for (let i = start; i < end; i += 1) {
      const entry = videoChunks[i];
      // Only the segment's first chunk needs the full decoderConfig meta (to write the track's avcC).
      muxer.addVideoChunk(entry.chunk, i === start ? entry.meta ?? firstMetaWithConfig : entry.meta);
    }

    if (muxAudio) {
      for (const a of audioChunks) {
        if (a.tsUs < startUs) continue;
        if (a.tsUs >= endUs) break;
        muxer.addAudioChunkRaw(a.data, 'key', a.tsUs, a.durUs, {
          decoderConfig: {
            codec: audioTrack.codec,
            numberOfChannels: audioTrack.audio.channel_count,
            sampleRate: audioTrack.audio.sample_rate,
            description: audioDescription,
          },
        } as any);
      }
    }

    muxer.finalize();
    files.push(new File([target.buffer], `${baseName}.part${seg + 1}.mp4`, { type: 'video/mp4' }));
  }

  opts.onProgress?.(1);
  return files;
}
