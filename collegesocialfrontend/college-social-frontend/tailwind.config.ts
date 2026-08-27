import type { Config } from 'tailwindcss';

// Premium dark-first theme: semantic tokens driven by CSS variables (see app/globals.css) so
// both light and dark themes share the same class names -- toggling is just swapping variable
// values via the `.dark` class on <html>, not sprinkling `dark:` on every usage.
const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  // Foundation utilities that are addressed by computed names (design-system gallery) or are
  // meant to be always-available building blocks for Phase B primitives.
  safelist: [
    { pattern: /^(bg|text|border)-accent-(50|100|200|300|400|500|600|700|800|900|950)$/ },
    { pattern: /^shadow-elev-[1-4]$/ },
    { pattern: /^text-fluid-(xs|sm|base|lg|xl|2xl|3xl)$/ },
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-arabic)', 'var(--font-latin)', 'Tahoma', 'Arial', 'sans-serif'],
      },
      colors: {
        background: 'rgb(var(--background) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--surface-2) / <alpha-value>)',
        'surface-3': 'rgb(var(--surface-3) / <alpha-value>)',
        overlay: 'rgb(var(--overlay) / <alpha-value>)',
        border: 'rgb(var(--border) / <alpha-value>)',
        foreground: 'rgb(var(--foreground) / <alpha-value>)',
        'muted-foreground': 'rgb(var(--muted-foreground) / <alpha-value>)',
        // `accent` stays usable bare (bg-accent, text-accent, accent/15) via DEFAULT; the
        // numbered steps map to the tonal ramp in globals.css for primitives that need a
        // specific tone (soft fills, pressed states, hairlines).
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          50: 'rgb(var(--accent-50) / <alpha-value>)',
          100: 'rgb(var(--accent-100) / <alpha-value>)',
          200: 'rgb(var(--accent-200) / <alpha-value>)',
          300: 'rgb(var(--accent-300) / <alpha-value>)',
          400: 'rgb(var(--accent-400) / <alpha-value>)',
          500: 'rgb(var(--accent-500) / <alpha-value>)',
          600: 'rgb(var(--accent-600) / <alpha-value>)',
          700: 'rgb(var(--accent-700) / <alpha-value>)',
          800: 'rgb(var(--accent-800) / <alpha-value>)',
          900: 'rgb(var(--accent-900) / <alpha-value>)',
          950: 'rgb(var(--accent-950) / <alpha-value>)',
        },
        'accent-2': 'rgb(var(--accent-2) / <alpha-value>)',
        gold: { DEFAULT: 'rgb(var(--gold) / <alpha-value>)' },
        // Bare `success`/`danger`/`warning` still resolve (DEFAULT); `-surface` adds the soft
        // tinted fill for alerts/badges/callouts (see the `--*-surface` tokens in globals.css).
        success: {
          DEFAULT: 'rgb(var(--success) / <alpha-value>)',
          surface: 'rgb(var(--success-surface) / <alpha-value>)',
        },
        danger: {
          DEFAULT: 'rgb(var(--danger) / <alpha-value>)',
          surface: 'rgb(var(--danger-surface) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'rgb(var(--warning) / <alpha-value>)',
          surface: 'rgb(var(--warning-surface) / <alpha-value>)',
        },
        // Legacy static scales -- kept only for the handful of literal accents not yet swept
        // over to semantic tokens (see plan Part 3). Do not add new usages of these.
        navy: {
          50: '#eef2f7',
          100: '#d7e1ec',
          200: '#b0c2d9',
          300: '#89a4c6',
          400: '#5d81ab',
          500: '#3d6591',
          600: '#2c4d73',
          700: '#1d3557',
          800: '#142642',
          900: '#0b1929',
          950: '#060f1a',
        },
      },
      borderColor: {
        // `border-border` (the default hairline) still resolves via colors above; these add
        // two extra weights: `border-subtle` for barely-there dividers, `border-strong` for
        // edges that need to hold (inputs, popovers, focused wells).
        subtle: 'rgb(var(--border-subtle) / <alpha-value>)',
        strong: 'rgb(var(--border-strong) / <alpha-value>)',
      },
      fontSize: {
        // Fluid scale -- opt-in via `text-fluid-*`. The default text-xs..2xl are left as-is so
        // existing screens keep their tuned fixed sizes; adopt these on new/reworked surfaces.
        'fluid-xs': ['clamp(0.72rem, 0.70rem + 0.10vw, 0.78rem)', { lineHeight: '1.5' }],
        'fluid-sm': ['clamp(0.82rem, 0.79rem + 0.14vw, 0.90rem)', { lineHeight: '1.55' }],
        'fluid-base': ['clamp(0.92rem, 0.88rem + 0.18vw, 1.02rem)', { lineHeight: '1.6' }],
        'fluid-lg': ['clamp(1.05rem, 0.99rem + 0.30vw, 1.20rem)', { lineHeight: '1.5' }],
        'fluid-xl': ['clamp(1.22rem, 1.12rem + 0.50vw, 1.45rem)', { lineHeight: '1.4' }],
        'fluid-2xl': ['clamp(1.48rem, 1.30rem + 0.90vw, 1.90rem)', { lineHeight: '1.3' }],
        'fluid-3xl': ['clamp(1.80rem, 1.48rem + 1.60vw, 2.55rem)', { lineHeight: '1.2' }],
      },
      boxShadow: {
        soft: '0 0 0 1px rgb(var(--border)), 0 1px 3px rgba(0, 0, 0, 0.2)',
        card: '0 0 0 1px rgb(var(--border)), 0 8px 24px -8px rgb(var(--accent) / 0.15)',
        glow: '0 0 0 1px rgb(var(--accent) / 0.4), 0 0 24px -4px rgb(var(--accent) / 0.5)',
        // Elevation ladder -- values live in globals.css so light/dark can differ (soft drop
        // shadow vs. hairline + deep cast).
        'elev-1': 'var(--elev-1)',
        'elev-2': 'var(--elev-2)',
        'elev-3': 'var(--elev-3)',
        'elev-4': 'var(--elev-4)',
      },
      borderRadius: {
        xl2: '1.25rem',
      },
      backgroundImage: {
        'gradient-accent': 'linear-gradient(135deg, rgb(var(--accent)), rgb(var(--accent-2)))',
      },
      transitionTimingFunction: {
        standard: 'var(--ease-standard)',
        emphasized: 'var(--ease-emphasized)',
        exit: 'var(--ease-exit)',
      },
      transitionDuration: {
        fast: 'var(--dur-fast)',
        base: 'var(--dur-base)',
        slow: 'var(--dur-slow)',
        slower: 'var(--dur-slower)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'bubble-in': { from: { opacity: '0', transform: 'scale(0.96) translateY(4px)' }, to: { opacity: '1', transform: 'scale(1) translateY(0)' } },
        // Overlay/menu entrance for Phase B primitives (Dialog, Menu, Popover).
        'scale-in': { from: { opacity: '0', transform: 'scale(0.94)' }, to: { opacity: '1', transform: 'scale(1)' } },
        blink: { '0%, 92%, 100%': { transform: 'scaleY(1)' }, '96%': { transform: 'scaleY(0.1)' } },
        bob: { '0%, 100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-2px)' } },
        wave: { '0%, 100%': { transform: 'rotate(0deg)' }, '25%': { transform: 'rotate(-18deg)' }, '75%': { transform: 'rotate(14deg)' } },
        'pulse-glow': {
          '0%': { boxShadow: '0 0 0 0 rgb(var(--gold) / 0.5)' },
          '70%': { boxShadow: '0 0 0 12px rgb(var(--gold) / 0)' },
          '100%': { boxShadow: '0 0 0 0 rgb(var(--gold) / 0)' },
        },
        // Skeleton loading sweep -- a travelling highlight band, richer than a flat pulse.
        'shimmer-sweep': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        // Aurora Glass (AI surfaces): two slow-drifting blurred blobs behind a frosted panel,
        // a soft breathing glow for focus/ready states, and a text shimmer for "thinking" copy.
        'aurora-1': {
          '0%, 100%': { transform: 'translate(-8%, -6%) scale(1)' },
          '50%': { transform: 'translate(10%, 6%) scale(1.15)' },
        },
        'aurora-2': {
          '0%, 100%': { transform: 'translate(8%, 8%) scale(1.1)' },
          '50%': { transform: 'translate(-10%, -8%) scale(0.95)' },
        },
        breathe: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgb(var(--accent) / 0.35)' },
          '50%': { boxShadow: '0 0 0 6px rgb(var(--accent) / 0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.15s ease-out',
        'slide-up': 'slide-up 0.2s ease-out',
        'bubble-in': 'bubble-in 0.15s ease-out',
        'scale-in': 'scale-in 0.16s var(--ease-emphasized)',
        blink: 'blink 4.5s ease-in-out infinite',
        bob: 'bob 2.4s ease-in-out infinite',
        wave: 'wave 0.6s ease-in-out infinite',
        'pulse-glow': 'pulse-glow 1.1s ease-out 3',
        'shimmer-sweep': 'shimmer-sweep 1.6s ease-in-out infinite',
        'aurora-1': 'aurora-1 17s ease-in-out infinite',
        'aurora-2': 'aurora-2 21s ease-in-out infinite',
        breathe: 'breathe 3s ease-in-out infinite',
        shimmer: 'shimmer 2.2s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
