'use client';

import { useEffect } from 'react';
import { captureError } from '@/lib/observability';

// Last-resort boundary for errors thrown in the root layout / during render. Reports to Sentry
// (a no-op until NEXT_PUBLIC_SENTRY_DSN is set) and offers a recovery action. RTL + Arabic to
// match the rest of the app; it replaces the whole document so it carries its own <html>/<body>.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureError(error, { digest: error.digest });
  }, [error]);

  return (
    <html lang="ar" dir="rtl">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          padding: '2rem',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
          background: '#0c0d12',
          color: '#e8e9f3',
          textAlign: 'center',
        }}
      >
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>حدث خطأ غير متوقع</h1>
        <p style={{ color: '#9a9db5', margin: 0, maxWidth: '28rem' }}>
          واجه التطبيق مشكلة أثناء تحميل هذه الصفحة. تم تسجيل الخطأ تلقائيًا.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            border: 'none',
            borderRadius: '9999px',
            padding: '0.6rem 1.4rem',
            fontSize: '0.95rem',
            fontWeight: 600,
            color: '#fff',
            background: '#6366f1',
            cursor: 'pointer',
          }}
        >
          إعادة المحاولة
        </button>
      </body>
    </html>
  );
}
