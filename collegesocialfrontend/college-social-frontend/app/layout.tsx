import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans_Arabic, IBM_Plex_Sans } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/Providers';

const fontArabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-arabic',
});

const fontLatin = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-latin',
});

export const metadata: Metadata = {
  title: 'IEAMS Students Club',
  description: 'الشبكة الاجتماعية لـ IEAMS Students Community — المحاضرات والملفات والدردشة في مكان واحد.',
};

// viewportFit=cover exposes env(safe-area-inset-*) so fixed bars can clear the iOS
// notch/home-indicator; no maximumScale lock, so pinch-zoom stays available.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

// Blocking inline script: applies the saved theme class before React hydrates, so there's no
// flash of the wrong theme on load. Defaults to dark when nothing is saved yet.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var theme = localStorage.getItem('theme') || 'dark';
    if (theme === 'dark') document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${fontArabic.variable} ${fontLatin.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
