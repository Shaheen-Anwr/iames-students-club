'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Building2, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

export function SetDepartmentBanner() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  if (!user || user.department || user.role === 'admin' || dismissed) return null;

  return (
    <div className="border-b border-accent/30 bg-accent/10 px-4 py-2.5 text-sm text-accent">
      <div className="flex flex-wrap items-center gap-3">
        <Building2 className="h-4 w-4 shrink-0" />
        <span className="flex-1">لم تختر شعبتك بعد. اختر شعبتك لتصلك المنشورات والإعلانات الخاصة بها.</span>
        <Link
          href="/profile"
          className="rounded-lg border border-accent/40 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/15"
        >
          اختر الشعبة
        </Link>
        <button onClick={() => setDismissed(true)} className="rounded-full p-1 text-accent hover:bg-accent/15">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
