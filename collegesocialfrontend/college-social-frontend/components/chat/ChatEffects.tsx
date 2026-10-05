'use client';

import { useEffect, useRef } from 'react';
import { onChatEffect } from '@/lib/chat-effects';
import type { MessageEffect } from '@/lib/types';

// Full-screen "send with effect" celebrations, drawn on one canvas with a small particle system
// (no dependency). Mount once per chat screen; anything calls playChatEffect() to trigger it.
// pointer-events: none, so it never blocks the thread; skipped entirely under reduced motion.

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  drag: number;
  rotation: number;
  spin: number;
  size: number;
  life: number; // ms elapsed
  maxLife: number; // ms
  delay: number; // ms before it appears
  color: string;
  kind: 'rect' | 'spark' | 'emoji';
  emoji?: string;
  sway?: number;
  twinkle?: boolean;
}

const CONFETTI_COLORS = ['#7C6CFF', '#F7B733', '#FF5C8A', '#2DD4BF', '#60A5FA', '#F472B6', '#FACC15', '#34D399'];
// Emoji 1.0-era hearts only, so older phones never draw a tofu box mid-celebration.
const HEARTS = ['❤️', '💖', '💕', '💗', '💘', '💞'];
const STARS = ['✨', '⭐', '🌟', '💫'];

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function spawn(effect: MessageEffect, w: number, h: number): Particle[] {
  const out: Particle[] = [];
  if (effect === 'confetti') {
    // Two cannons in the bottom corners firing up and inward (iMessage-style).
    for (const side of [0, 1]) {
      for (let i = 0; i < 90; i++) {
        const angle = side === 0 ? rand(-80, -45) : rand(-135, -100);
        const speed = rand(0.9, 1.75) * Math.min(1.25, h / 700);
        const rad = (angle * Math.PI) / 180;
        out.push({
          x: side === 0 ? -10 : w + 10,
          y: h * 0.92,
          vx: Math.cos(rad) * speed,
          vy: Math.sin(rad) * speed,
          gravity: 0.0016,
          drag: 0.992,
          rotation: rand(0, Math.PI * 2),
          spin: rand(-0.012, 0.012),
          size: rand(6, 11),
          life: 0,
          maxLife: rand(2600, 3600),
          delay: rand(0, 160),
          color: CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0],
          kind: 'rect',
        });
      }
    }
  } else if (effect === 'hearts') {
    for (let i = 0; i < 46; i++) {
      out.push({
        x: rand(w * 0.05, w * 0.95),
        y: h + rand(10, 80),
        vx: 0,
        vy: -rand(0.16, 0.34),
        gravity: 0,
        drag: 1,
        rotation: rand(-0.3, 0.3),
        spin: 0,
        size: rand(18, 40),
        life: 0,
        maxLife: rand(2800, 3800),
        delay: rand(0, 1100),
        color: '',
        kind: 'emoji',
        emoji: HEARTS[(Math.random() * HEARTS.length) | 0],
        sway: rand(0.6, 1.6),
      });
    }
  } else if (effect === 'fireworks') {
    const bursts = 5;
    for (let b = 0; b < bursts; b++) {
      const cx = rand(w * 0.15, w * 0.85);
      const cy = rand(h * 0.15, h * 0.55);
      const color = CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0];
      const delay = b * 380 + rand(0, 120);
      const count = 70;
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + rand(-0.05, 0.05);
        const speed = rand(0.12, 0.34);
        out.push({
          x: cx,
          y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          gravity: 0.00022,
          drag: 0.985,
          rotation: 0,
          spin: 0,
          size: rand(1.6, 3),
          life: 0,
          maxLife: rand(1200, 1700),
          delay,
          color: i % 5 === 0 ? '#ffffff' : color,
          kind: 'spark',
        });
      }
    }
  } else {
    for (let i = 0; i < 44; i++) {
      out.push({
        x: rand(w * 0.04, w * 0.96),
        y: rand(h * 0.08, h * 0.9),
        vx: rand(-0.02, 0.02),
        vy: -rand(0.01, 0.05),
        gravity: 0,
        drag: 1,
        rotation: rand(-0.4, 0.4),
        spin: rand(-0.002, 0.002),
        size: rand(16, 34),
        life: 0,
        maxLife: rand(1400, 2200),
        delay: rand(0, 1500),
        color: '',
        kind: 'emoji',
        emoji: STARS[(Math.random() * STARS.length) | 0],
        twinkle: true,
      });
    }
  }
  return out;
}

export function ChatEffects() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>([]);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

    const resize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      canvas.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    let last = 0;
    const tick = (now: number) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) {
        frame.current = null;
        return;
      }
      const dt = last ? Math.min(now - last, 48) : 16;
      last = now;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const alive: Particle[] = [];
      for (const p of particles.current) {
        p.life += dt;
        if (p.life < p.delay) {
          alive.push(p);
          continue;
        }
        const t = p.life - p.delay;
        if (t > p.maxLife) continue;
        p.vx *= Math.pow(p.drag, dt / 16);
        p.vy = p.vy * Math.pow(p.drag, dt / 16) + p.gravity * dt;
        p.x += p.vx * dt + (p.sway ? Math.sin(t / 380) * p.sway : 0);
        p.y += p.vy * dt;
        p.rotation += p.spin * dt;
        const progress = t / p.maxLife;
        const fade = progress > 0.75 ? 1 - (progress - 0.75) / 0.25 : 1;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        if (p.kind === 'rect') {
          ctx.globalAlpha = fade;
          ctx.fillStyle = p.color;
          // Fake 3D flutter: squash the rect as it "turns".
          ctx.scale(1, Math.abs(Math.cos(p.rotation * 3)) * 0.8 + 0.2);
          ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
        } else if (p.kind === 'spark') {
          ctx.globalAlpha = fade;
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(0, 0, p.size, 0, Math.PI * 2);
          ctx.fill();
          // Short motion trail.
          ctx.globalAlpha = fade * 0.35;
          ctx.beginPath();
          ctx.arc(-p.vx * 30, -p.vy * 30, p.size * 0.7, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.emoji) {
          const scale = p.twinkle ? Math.sin(Math.min(progress, 1) * Math.PI) : Math.min(1, t / 250);
          ctx.globalAlpha = p.twinkle ? scale : fade;
          ctx.scale(Math.max(scale, 0.01), Math.max(scale, 0.01));
          ctx.font = `${p.size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(p.emoji, 0, 0);
        }
        ctx.restore();
        alive.push(p);
      }
      particles.current = alive;

      if (alive.length) {
        frame.current = requestAnimationFrame(tick);
      } else {
        frame.current = null;
        last = 0;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    const off = onChatEffect((effect) => {
      if (reduce.matches) return;
      resize();
      particles.current = [...particles.current, ...spawn(effect, window.innerWidth, window.innerHeight)].slice(-900);
      if (frame.current === null) {
        last = 0;
        frame.current = requestAnimationFrame(tick);
      }
    });

    window.addEventListener('resize', resize);
    return () => {
      off();
      window.removeEventListener('resize', resize);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      particles.current = [];
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 z-[80]" />;
}
