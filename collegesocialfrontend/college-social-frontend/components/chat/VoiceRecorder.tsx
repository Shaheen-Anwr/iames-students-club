'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Pause, Play, Send, Square, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { haptic } from '@/lib/haptics';
import { VoiceMessagePlayer } from './VoiceMessagePlayer';

const MAX_SECONDS = 10 * 60;
const BARS = 48;

type Phase = 'starting' | 'recording' | 'paused' | 'review';

// The first container format this browser can record, codec suffix included (MediaRecorder needs
// it), e.g. Chrome/Firefox -> webm/opus, Safari -> mp4.
function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return undefined;
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find((t) =>
    MediaRecorder.isTypeSupported(t),
  );
}

function formatSeconds(total: number): string {
  const s = Math.max(0, Math.floor(total));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Hands-free voice-note recorder: live input waveform, pause/resume, stop-to-review (play it back
// before sending), send straight from recording, or discard. Calls onSend with a File whose type
// is the bare container MIME (the upload endpoint rejects "audio/webm;codecs=opus").
export function VoiceRecorder({
  onCancel,
  onSend,
  onError,
}: {
  onCancel: () => void;
  onSend: (file: File, seconds: number) => void;
  onError: (message: string) => void;
}) {
  const [phase, setPhase] = useState<Phase>('starting');
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0.06));
  const [reviewUrl, setReviewUrl] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedMs = useRef(0);
  const segmentStart = useRef<number | null>(null);
  const mimeRef = useRef('audio/webm');
  const blobRef = useRef<Blob | null>(null);
  const reviewUrlRef = useRef<string | null>(null);
  const sendOnStop = useRef(false);
  const callbacks = useRef({ onCancel, onSend, onError });
  callbacks.current = { onCancel, onSend, onError };

  const totalSeconds = () =>
    (elapsedMs.current + (segmentStart.current !== null ? performance.now() - segmentStart.current : 0)) / 1000;

  function deliver() {
    const blob = blobRef.current;
    if (!blob || blob.size === 0) {
      callbacks.current.onCancel();
      return;
    }
    const type = mimeRef.current;
    const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
    const file = new File([blob], `voice-${Date.now()}.${ext}`, { type });
    callbacks.current.onSend(file, Math.max(1, Math.round(totalSeconds())));
  }

  function stopMeters() {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    void audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const preferred = pickMimeType();
        // 32kbps is plenty for speech and keeps notes small.
        const recorder = new MediaRecorder(stream, {
          ...(preferred ? { mimeType: preferred } : {}),
          audioBitsPerSecond: 32000,
        });
        mimeRef.current = (recorder.mimeType || preferred || 'audio/webm').split(';')[0];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        recorder.onstop = () => {
          if (segmentStart.current !== null) {
            elapsedMs.current += performance.now() - segmentStart.current;
            segmentStart.current = null;
          }
          stopMeters();
          stream.getTracks().forEach((t) => t.stop());
          blobRef.current = new Blob(chunksRef.current, { type: mimeRef.current });
          setSeconds(totalSeconds());
          if (sendOnStop.current) {
            deliver();
            return;
          }
          if (!blobRef.current.size) {
            callbacks.current.onCancel();
            return;
          }
          const url = URL.createObjectURL(blobRef.current);
          reviewUrlRef.current = url;
          setReviewUrl(url);
          setPhase('review');
        };
        recorder.start(250);
        recorderRef.current = recorder;
        segmentStart.current = performance.now();
        setPhase('recording');
        haptic('impact');

        timerRef.current = setInterval(() => {
          const s = totalSeconds();
          setSeconds(s);
          if (s >= MAX_SECONDS && recorderRef.current?.state === 'recording') recorderRef.current.stop();
        }, 200);

        // Live input level -> scrolling waveform.
        const Ctor =
          window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctor) {
          const ctx = new Ctor();
          audioCtxRef.current = ctx;
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 512;
          ctx.createMediaStreamSource(stream).connect(analyser);
          const data = new Uint8Array(analyser.fftSize);
          let lastPush = 0;
          const loop = (now: number) => {
            if (now - lastPush > 70 && recorderRef.current?.state === 'recording') {
              lastPush = now;
              analyser.getByteTimeDomainData(data);
              let sum = 0;
              for (let i = 0; i < data.length; i++) {
                const v = (data[i] - 128) / 128;
                sum += v * v;
              }
              const rms = Math.sqrt(sum / data.length);
              setLevels((prev) => [...prev.slice(1), Math.min(1, 0.06 + rms * 3.4)]);
            }
            rafRef.current = requestAnimationFrame(loop);
          };
          rafRef.current = requestAnimationFrame(loop);
        }
      } catch {
        if (!cancelled) callbacks.current.onError('تعذّر الوصول إلى الميكروفون. تحقّق من أذونات المتصفح.');
      }
    })();

    return () => {
      cancelled = true;
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        recorder.onstop = null;
        try {
          recorder.stop();
        } catch {
          /* already stopped */
        }
      }
      stopMeters();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (reviewUrlRef.current) URL.revokeObjectURL(reviewUrlRef.current);
    };
    // Mount-only: the recorder lives exactly as long as this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canPause = typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.prototype.pause === 'function';

  function togglePause() {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (recorder.state === 'recording') {
      recorder.pause();
      if (segmentStart.current !== null) elapsedMs.current += performance.now() - segmentStart.current;
      segmentStart.current = null;
      setPhase('paused');
    } else if (recorder.state === 'paused') {
      recorder.resume();
      segmentStart.current = performance.now();
      setPhase('recording');
    }
    haptic('select');
  }

  function stopToReview() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  }

  function send() {
    haptic('success');
    if (phase === 'review') {
      deliver();
      return;
    }
    sendOnStop.current = true;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    else deliver();
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-1.5 rounded-[1.6rem] bg-surface-2/90 p-1.5 ring-1 ring-danger/25"
    >
      <button
        type="button"
        onClick={onCancel}
        aria-label="حذف التسجيل"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
      >
        <Trash2 className="h-[18px] w-[18px]" />
      </button>

      {phase === 'review' && reviewUrl ? (
        <div className="min-w-0 flex-1">
          <VoiceMessagePlayer src={reviewUrl} isOwn={false} duration={seconds} bare />
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-2.5 px-1">
          <span
            className={cn('h-2.5 w-2.5 shrink-0 rounded-full bg-danger', phase === 'recording' && 'animate-pulse')}
            aria-hidden
          />
          <span className="w-10 shrink-0 text-sm font-semibold tabular-nums text-foreground" aria-live="polite">
            {formatSeconds(seconds)}
          </span>
          <div dir="ltr" className="flex h-8 min-w-0 flex-1 items-center justify-end gap-[2px] overflow-hidden">
            {levels.map((level, i) => (
              <span
                key={i}
                className={cn('w-[3px] shrink-0 rounded-full transition-[height] duration-75', phase === 'paused' ? 'bg-muted-foreground/40' : 'bg-danger/75')}
                style={{ height: `${Math.round(Math.max(0.1, level) * 100)}%` }}
              />
            ))}
          </div>
        </div>
      )}

      {phase !== 'review' && phase !== 'starting' && (
        <>
          {canPause && (
            <button
              type="button"
              onClick={togglePause}
              aria-label={phase === 'paused' ? 'متابعة التسجيل' : 'إيقاف مؤقت'}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-surface-3"
            >
              {phase === 'paused' ? <Play className="h-[18px] w-[18px] translate-x-0.5" /> : <Pause className="h-[18px] w-[18px]" />}
            </button>
          )}
          <button
            type="button"
            onClick={stopToReview}
            aria-label="إنهاء والاستماع قبل الإرسال"
            title="إنهاء والاستماع"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-surface-3"
          >
            <Square className="h-4 w-4 fill-current" />
          </button>
        </>
      )}

      <button
        type="button"
        onClick={send}
        disabled={phase === 'starting'}
        aria-label="إرسال الرسالة الصوتية"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-accent text-white shadow-elev-2 transition-transform hover:scale-105 active:scale-95 disabled:opacity-50"
      >
        <Send className="h-[18px] w-[18px] rtl:-scale-x-100" />
      </button>
    </motion.div>
  );
}
