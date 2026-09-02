import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans_Arabic, IBM_Plex_Sans } from 'next/font/google';
import './globals.css';
import { ViewTransitions } from 'next-view-transitions';
import { Providers } from '@/components/Providers';
import { SpeedInsights } from "@vercel/speed-insights/next"
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

// Absolute base for OG/canonical URLs. Overridable per-deploy; defaults to the Vercel domain
// so no dashboard config is needed, matching this repo's zero-manual-setup env convention.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://iames-students-club.vercel.app';

const DESCRIPTION =
  'الشبكة الاجتماعية لطلاب وأساتذة IAEMS — المحاضرات والملفات والدردشة والجدول والواجبات في مكان واحد.';

// Favicon (app/icon.svg), apple-touch icon (app/apple-icon.tsx) and the share card
// (app/opengraph-image.tsx) are wired automatically by Next's file conventions, so they're
// deliberately absent here.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: 'IAEMS Students Club',
  title: {
    default: 'IAEMS Students Club — نادي طلاب IAEMS',
    template: '%s · IAEMS Students Club',
  },
  description: DESCRIPTION,
  keywords: [
    'IAEMS',
    'IAEMS Students Club',
    'IAEMS Students Community',
    'نادي طلاب',
    'شبكة اجتماعية جامعية',
    'محاضرات',
    'واجبات',
    'جدول دراسي',
    'college social network',
    'campus community',
  ],
  authors: [{ name: 'IAEMS Students Club' }],
  creator: 'IAEMS Students Club',
  publisher: 'IAEMS Students Club',
  category: 'education',
  manifest: '/manifest.json',
  alternates: { canonical: '/' },
  formatDetection: { telephone: false, email: false, address: false },
  appleWebApp: {
    capable: true,
    title: 'IAEMS',
    statusBarStyle: 'black-translucent',
  },
  openGraph: {
    type: 'website',
    siteName: 'IAEMS Students Club',
    title: 'IAEMS Students Club — نادي طلاب IAEMS',
    description: DESCRIPTION,
    url: '/',
    locale: 'ar_AR',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'IAEMS Students Club',
    description: DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
};

// viewportFit=cover exposes env(safe-area-inset-*) so fixed bars can clear the iOS
// notch/home-indicator; no maximumScale lock, so pinch-zoom stays available. themeColor
// matches the app-icon tile, used for the PWA's manifest/installed-app chrome.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#141520',
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
    <ViewTransitions>
      <html lang="ar" dir="rtl" className={`${fontArabic.variable} ${fontLatin.variable}`} suppressHydrationWarning>
        <head>
          <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        </head>
        <body className="font-sans antialiased">
          <Providers>{children}</Providers>
        </body>
      </html>
    </ViewTransitions>
  );
}
