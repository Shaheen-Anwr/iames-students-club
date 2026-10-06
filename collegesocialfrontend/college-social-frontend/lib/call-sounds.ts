'use client';

// Phone tones for calls, synthesized with the Web Audio API (no audio files to ship or load):
//   ringback -- what the CALLER hears while the other phone rings (UK-style double ring)
//   ringtone -- the incoming-call melody on the CALLEE's side, with a vibration pattern on phones
//   cues     -- one-shot busy / connected / ended sounds
// Browsers only start audio after a user gesture, so installAudioUnlock() resumes the shared
// AudioContext on the first tap/keypress -- after that an incoming call can ring on its own.

let ctx: AudioContext | null = null;
let unlockInstalled = false;
let loopTimer: ReturnType<typeof setInterval> | null = null;

// Shared with lib/chat-sounds.ts -- one AudioContext (and one unlock) for every app sound.
export function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  return ctx;
}

export function installAudioUnlock() {
  if (unlockInstalled || typeof window === 'undefined') return;
  unlockInstalled = true;
  const unlock = () => {
    audioContext();
  };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
}

// One enveloped tone (optionally a chord of frequencies) at an absolute AudioContext time.
function tone(c: AudioContext, freqs: number[], start: number, duration: number, volume: number, type: OscillatorType = 'sine') {
  const gain = c.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.015);
  gain.gain.setValueAtTime(volume, Math.max(start + 0.02, start + duration - 0.05));
  gain.gain.linearRampToValueAtTime(0.0001, start + duration);
  gain.connect(c.destination);
  for (const frequency of freqs) {
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    osc.connect(gain);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }
}

interface LoopPattern {
  /** ms between cycle starts */
  cycle: number;
  play: (c: AudioContext, t0: number) => void;
  vibrate?: number[];
}

const LOOPS: Record<'ringback' | 'ringtone', LoopPattern> = {
  ringback: {
    cycle: 3000,
    play: (c, t) => {
      tone(c, [400, 450], t, 0.4, 0.05);
      tone(c, [400, 450], t + 0.6, 0.4, 0.05);
    },
  },
  ringtone: {
    cycle: 2600,
    vibrate: [450, 200, 450],
    play: (c, t) => {
      // E5 G#5 B5 E6, twice -- bright and recognizable without being harsh.
      const notes = [659.25, 830.61, 987.77, 1318.51];
      [0, 0.72].forEach((offset) =>
        notes.forEach((frequency, i) => tone(c, [frequency], t + offset + i * 0.13, 0.17, 0.11, 'triangle')),
      );
    },
  },
};

export function startCallLoop(name: 'ringback' | 'ringtone') {
  stopCallLoop();
  const pattern = LOOPS[name];
  const run = () => {
    const c = audioContext();
    if (c && c.state === 'running') pattern.play(c, c.currentTime + 0.03);
    if (pattern.vibrate && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(pattern.vibrate);
      } catch {
        /* not allowed without a gesture on some browsers */
      }
    }
  };
  run();
  loopTimer = setInterval(run, pattern.cycle);
}

export function stopCallLoop() {
  if (loopTimer) clearInterval(loopTimer);
  loopTimer = null;
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(0);
    } catch {
      /* ignore */
    }
  }
}

export function playCallCue(name: 'busy' | 'connected' | 'ended') {
  const c = audioContext();
  if (!c || c.state !== 'running') return;
  const t = c.currentTime + 0.03;
  if (name === 'busy') {
    for (let i = 0; i < 4; i++) tone(c, [425], t + i * 0.7, 0.35, 0.06);
  } else if (name === 'connected') {
    tone(c, [523.25], t, 0.11, 0.07);
    tone(c, [783.99], t + 0.12, 0.2, 0.07);
  } else {
    tone(c, [659.25], t, 0.14, 0.07);
    tone(c, [440], t + 0.17, 0.24, 0.07);
  }
}
