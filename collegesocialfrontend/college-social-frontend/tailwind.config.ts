import type { Config } from 'tailwindcss';

// Premium dark-first theme: semantic tokens driven by CSS variables (see app/globals.css) so
// both light and dark themes share the same class names -- toggling is just swapping variable
// values via the `.dark` class on <html>, not sprinkling `dark:` on every usage.
const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-arabic)', 'var(--font-latin)', 'Tahoma', 'Arial', 'sans-serif'],
      },
      colors: {
        background: 'rgb(var(--background) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--surface-2) / <alpha-value>)',
        border: 'rgb(var(--border) / <alpha-value>)',
        foreground: 'rgb(var(--foreground) / <alpha-value>)',
        'muted-foreground': 'rgb(var(--muted-foreground) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        'accent-2': 'rgb(var(--accent-2) / <alpha-value>)',
        gold: { DEFAULT: 'rgb(var(--gold) / <alpha-value>)' },
        success: 'rgb(var(--success) / <alpha-value>)',
        danger: 'rgb(var(--danger) / <alpha-value>)',
        warning: 'rgb(var(--warning) / <alpha-value>)',
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
      boxShadow: {
        soft: '0 0 0 1px rgb(var(--border)), 0 1px 3px rgba(0, 0, 0, 0.2)',
        card: '0 0 0 1px rgb(var(--border)), 0 8px 24px -8px rgb(var(--accent) / 0.15)',
        glow: '0 0 0 1px rgb(var(--accent) / 0.4), 0 0 24px -4px rgb(var(--accent) / 0.5)',
      },
      borderRadius: {
        xl2: '1.25rem',
      },
      backgroundImage: {
        'gradient-accent': 'linear-gradient(135deg, rgb(var(--accent)), rgb(var(--accent-2)))',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'bubble-in': { from: { opacity: '0', transform: 'scale(0.96) translateY(4px)' }, to: { opacity: '1', transform: 'scale(1) translateY(0)' } },
        blink: { '0%, 92%, 100%': { transform: 'scaleY(1)' }, '96%': { transform: 'scaleY(0.1)' } },
        bob: { '0%, 100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-2px)' } },
        wave: { '0%, 100%': { transform: 'rotate(0deg)' }, '25%': { transform: 'rotate(-18deg)' }, '75%': { transform: 'rotate(14deg)' } },
        'pulse-glow': {
          '0%': { boxShadow: '0 0 0 0 rgb(var(--gold) / 0.5)' },
          '70%': { boxShadow: '0 0 0 12px rgb(var(--gold) / 0)' },
          '100%': { boxShadow: '0 0 0 0 rgb(var(--gold) / 0)' },
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
        blink: 'blink 4.5s ease-in-out infinite',
        bob: 'bob 2.4s ease-in-out infinite',
        wave: 'wave 0.6s ease-in-out infinite',
        'pulse-glow': 'pulse-glow 1.1s ease-out 3',
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
