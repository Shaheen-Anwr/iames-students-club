'use client';

import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

const BAR_COUNT = 36;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Lazily created and reused across every player on the page -- browsers cap the number of
// concurrent AudioContexts, and there's no reason to spin up a new one per voice note.
let sharedAudioContext: AudioContext | null = null;
function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedAudioContext) sharedAudioContext = new Ctor();
  return sharedAudioContext;
}

// Deterministic fallback shape (a gentle sine envelope) used when decoding fails -- e.g. Safari's
// stricter autoplay/audio policies, or a transient network hiccup -- so the bar UI never looks
// broken, it just isn't a *true* waveform for that one message.
function fallbackPeaks(): number[] {
  return Array.from({ length: BAR_COUNT }, (_, i) => 0.35 + 0.5 * Math.abs(Math.sin((i / BAR_COUNT) * Math.PI * 3.2)));
}

async function computePeaks(src: string): Promise<number[]> {
  const ctx = getAudioContext();
  if (!ctx) return fallbackPeaks();
  const res = await fetch(src);
  const arrayBuffer = await res.arrayBuffer();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
  const channel = audioBuffer.getChannelData(0);
  const samplesPerBar = Math.max(1, Math.floor(channel.length / BAR_COUNT));
  const peaks: number[] = [];
  for (let bar = 0; bar < BAR_COUNT; bar++) {
    let max = 0;
    const start = bar * samplesPerBar;
    for (let i = start; i < start + samplesPerBar && i < channel.length; i++) {
      max = Math.max(max, Math.abs(channel[i]));
    }
    peaks.push(max);
  }
  const loudest = Math.max(...peaks, 0.01);
  return peaks.map((p) => Math.max(0.12, p / loudest));
}

function Bars({ peaks, className }: { peaks: number[]; className: string }) {
  return (
    <div className={cn('flex h-7 w-full items-center gap-[2px]', className)}>
      {peaks.map((peak, i) => (
        <span key={i} className="w-full min-w-[2px] rounded-full bg-current" style={{ height: `${Math.round(peak * 100)}%` }} />
      ))}
    </div>
  );
}

export function VoiceMessagePlayer({ src, isOwn, duration }: { src: string; isOwn: boolean; duration?: number | null }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const barsRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(duration ?? 0);
  const [peaks, setPeaks] = useState<number[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    computePeaks(src)
      .catch(() => fallbackPeaks())
      .then((p) => !cancelled && setPeaks(p));
    return () => {
      cancelled = true;
    };
  }, [src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTimeUpdate = () => setProgress(audio.currentTime);
    const onLoadedMetadata = () => {
      if (Number.isFinite(audio.duration)) setTotal(audio.duration);
    };
    const onEnded = () => {
      setPlaying(false);
      setProgress(0);
    };
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
    };
  }, []);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      audio.play();
    }
    setPlaying(!playing);
  }

  function seekToClientX(clientX: number) {
    const audio = audioRef.current;
    const bars = barsRef.current;
    if (!audio || !bars || !total) return;
    const rect = bars.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const value = fraction * total;
    audio.currentTime = value;
    setProgress(value);
  }

  const fraction = total > 0 ? Math.min(1, progress / total) : 0;

  return (
    <div className={cn('flex w-64 items-center gap-2.5 rounded-2xl px-3 py-2.5', isOwn ? 'bg-gradient-accent text-white' : 'bg-surface-2/70 text-foreground')}>
      <audio ref={audioRef} src={src} preload="metadata" className="hidden" />
      <button
        onClick={toggle}
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-transform hover:scale-105',
          isOwn ? 'bg-white/20' : 'bg-accent/15 text-accent',
        )}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-0.5" />}
      </button>
      <div className="flex-1">
        <div
          ref={barsRef}
          onClick={(e) => seekToClientX(e.clientX)}
          className={cn('relative cursor-pointer', isOwn ? 'text-white/40' : 'text-accent/25')}
        >
          {peaks ? (
            <>
              <Bars peaks={peaks} className="" />
              <div className={cn('absolute inset-0 overflow-hidden', isOwn ? 'text-white' : 'text-accent')} style={{ width: `${fraction * 100}%` }}>
                <Bars peaks={peaks} className="" />
              </div>
            </>
          ) : (
            <div className="h-7 w-full animate-pulse rounded-full bg-current opacity-30" />
          )}
        </div>
        <span className={cn('text-[11px]', isOwn ? 'text-white/80' : 'text-muted-foreground')}>
          {formatTime(playing || progress > 0 ? progress : total)}
        </span>
      </div>
    </div>
  );
}
