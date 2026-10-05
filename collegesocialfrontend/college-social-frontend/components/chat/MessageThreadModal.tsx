'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Avatar } from '@/components/ui/Avatar';
import { chatApi } from '@/lib/chat-api';
import { formatClock, messagePreview, messageSenderName } from '@/lib/chat-helpers';
import { useAuth } from '@/lib/auth-context';
import { useSocket } from '@/lib/socket-context';
import { useToast } from '@/lib/toast-context';
import { assetUrl, cn } from '@/lib/utils';
import type { Message } from '@/lib/types';
import { FormattedText } from './FormattedText';

export function MessageThreadModal({ root, onClose }: { root: Message | null; onClose: () => void }) {
  const { socket } = useSocket();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [replies, setReplies] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [reload, setReload] = useState(0);
  const bottom = useRef<HTMLDivElement>(null);
  const activeRoot = useRef(root?._id);
  activeRoot.current = root?._id;
  const rootId = root?._id;
  const conversationId = root?.conversation;

  useEffect(() => {
    if (!rootId) return;
    let active = true;
    setLoading(true);
    setError('');
    setReplies([]);
    setText('');
    setSending(false);
    const load = () => chatApi.thread(rootId).then((data) => {
      if (active) setReplies((current) => {
        const merged = new Map(data.replies.map((reply) => [reply._id, reply]));
        current.forEach((reply) => merged.set(reply._id, reply));
        return [...merged.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      });
    }).catch(() => { if (active) setError('تعذّر تحميل الردود.'); })
      .finally(() => { if (active) setLoading(false); });
    void load();
    const receive = (message: Message) => {
      if (message.threadRoot !== rootId) return;
      setReplies((current) => current.some((reply) => reply._id === message._id)
        ? current.map((reply) => reply._id === message._id ? message : reply)
        : [...current, message]);
    };
    const deleted = (payload: { message?: Message; messageId?: string; forEveryone?: boolean }) => {
      if (payload.forEveryone && payload.message) receive(payload.message);
      else if (payload.messageId) setReplies((current) => current.filter((reply) => reply._id !== payload.messageId));
    };
    socket?.on('newMessage', receive);
    socket?.on('messageUpdated', receive);
    socket?.on('messageDeleted', deleted);
    socket?.on('connect', load);
    return () => {
      active = false;
      socket?.off('newMessage', receive);
      socket?.off('messageUpdated', receive);
      socket?.off('messageDeleted', deleted);
      socket?.off('connect', load);
    };
  }, [rootId, reload, socket]);

  useEffect(() => { bottom.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [replies.length]);

  function send() {
    if (!text.trim() || sending || !rootId) return;
    if (!socket?.connected) { showToast('لا يوجد اتصال الآن — حاول بعد لحظات.', 'error'); return; }
    setSending(true);
    const sentRoot = rootId;
    socket.timeout(12_000).emit('sendMessage', { conversationId, threadRoot: rootId, text: text.trim() },
      (error: Error | null, response?: { ok?: boolean }) => {
        if (activeRoot.current !== sentRoot) return;
        setSending(false);
        if (error || !response?.ok) { showToast('تعذّر إرسال الرد. حاول مجددًا.', 'error'); return; }
        setText('');
      });
  }

  return (
    <Modal open={!!root} onClose={onClose} title="نقاش الرسالة" className="max-w-xl">
      <div className="mb-4 rounded-xl border-s-4 border-accent bg-accent/5 p-3">
        <p className="mb-1 text-xs font-semibold text-accent">{root && messageSenderName(root)}</p>
        <p dir="auto" className="line-clamp-4 whitespace-pre-wrap text-sm">{root && messagePreview(root)}</p>
      </div>
      <div className="max-h-[45vh] space-y-3 overflow-y-auto px-1 scrollbar-thin" aria-live="polite">
        {loading ? <Loader2 className="mx-auto my-6 h-5 w-5 animate-spin text-accent" /> : error ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{error}<button type="button" className="ms-2 text-accent" onClick={() => setReload((value) => value + 1)}>إعادة المحاولة</button></p>
        ) : !replies.length ? <p className="py-6 text-center text-sm text-muted-foreground">ابدأ نقاشًا حول هذه الرسالة. تظهر الردود هنا لأعضاء المجموعة.</p> : replies.map((reply) => (
          <div key={reply._id} className="flex items-start gap-2">
            <Avatar src={assetUrl(reply.sender?.photoUrl)} name={messageSenderName(reply)} size="xs" />
            <div className={cn('min-w-0 flex-1 rounded-xl p-2.5', reply.sender?._id === user?._id ? 'bg-accent/10' : 'bg-surface-2')}>
              <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground"><span className="font-semibold">{messageSenderName(reply)}</span><time dateTime={reply.createdAt}>{formatClock(reply.createdAt)}</time></div>
              <div dir="auto" className="whitespace-pre-wrap break-words text-sm">{reply.deletedForEveryone ? 'تم حذف هذه الرسالة' : <FormattedText text={reply.text || messagePreview(reply)} />}</div>
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>
      <form className="mt-4 flex items-end gap-2 border-t border-border pt-3" onSubmit={(event) => { event.preventDefault(); send(); }}>
        <textarea aria-label="رد في النقاش" placeholder="اكتب ردًا في النقاش…" value={text} rows={2} maxLength={10000}
          onChange={(event) => setText(event.target.value)} disabled={sending}
          className="min-w-0 flex-1 resize-none rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:outline-accent" />
        <button type="submit" aria-label="إرسال الرد" disabled={sending || !text.trim() || !!root?.deletedForEveryone}
          className="rounded-full bg-accent p-3 text-white disabled:opacity-40">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button>
      </form>
    </Modal>
  );
}
