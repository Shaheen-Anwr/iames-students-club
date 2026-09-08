'use client';

import { Lock } from 'lucide-react';

// The WhatsApp-style banner that opens an encrypted thread. Centered, unobtrusive, and it says
// plainly that the server (us) can't read the messages either -- see docs/e2ee-design.md.
export function EncryptionNote() {
  return (
    <div className="mx-auto my-3 flex max-w-sm items-start gap-2 rounded-xl bg-amber-500/10 px-3.5 py-2.5 text-center text-[12.5px] leading-relaxed text-amber-900 dark:text-amber-200">
      <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <p>
        الرسائل في هذه المحادثة محميّة بالتشفير من طرف إلى طرف. لا أحد خارج هذه المحادثة يمكنه
        قراءتها أو الاستماع إليها، ولا حتى فريق التطبيق.
      </p>
    </div>
  );
}
