'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, FileText, Star } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Spinner } from '@/components/ui/Spinner';
import { api } from '@/lib/api';
import { assetUrl, timeAgo } from '@/lib/utils';
import type { Message } from '@/lib/types';

export function StarredMessages() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<Message[]>('/chat/starred').then((data) => {
      setMessages(data);
      setLoading(false);
    });
  }, []);

  async function unstar(id: string) {
    await api.delete(`/chat/messages/${id}/star`);
    setMessages((prev) => prev.filter((m) => m._id !== id));
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b border-border bg-surface px-4 py-3.5">
        <Link href="/chat" className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground lg:hidden">
          <ArrowRight className="h-5 w-5" />
        </Link>
        <p className="text-sm font-semibold text-foreground">الرسائل المميزة بنجمة</p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-surface-2 px-4 py-4 scrollbar-thin sm:px-6">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Spinner className="h-6 w-6" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-2/70">
              <Star className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">لا توجد رسائل مميزة بعد</p>
          </div>
        ) : (
          <div className="space-y-2">
            {messages.map((message) => (
              <div key={message._id} className="flex items-start gap-3 rounded-2xl bg-surface p-3.5 shadow-soft">
                <Avatar src={assetUrl(message.sender?.photoUrl)} name={message.sender?.name ?? 'مستخدم محذوف'} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">{message.sender?.name ?? 'مستخدم محذوف'}</p>
                    <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(message.createdAt)}</span>
                  </div>
                  {message.text && <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-foreground">{message.text}</p>}
                  {message.attachments?.map((a, i) =>
                    a.type === 'image' ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={assetUrl(a.url)} alt="" className="mt-1.5 max-h-40 rounded-xl object-cover" />
                    ) : (
                      <a key={i} href={assetUrl(a.url)} target="_blank" rel="noopener noreferrer" className="mt-1.5 flex items-center gap-1.5 text-xs text-accent">
                        <FileText className="h-3.5 w-3.5" /> {a.name ?? 'مرفق'}
                      </a>
                    ),
                  )}
                  <div className="mt-2 flex items-center gap-3">
                    <Link href={`/chat/${message.conversation}`} className="text-xs font-medium text-accent hover:underline">
                      الانتقال إلى المحادثة
                    </Link>
                    <button onClick={() => unstar(message._id)} className="text-xs font-medium text-muted-foreground hover:text-danger">
                      إلغاء التمييز
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
