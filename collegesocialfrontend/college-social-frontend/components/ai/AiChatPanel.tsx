'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowDown, BookOpen, ClipboardList, FileText, Paperclip, Send, Sparkles, X } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { api, ApiError, streamAiMessage, type AiMessageAttachment } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { useAi } from '@/lib/ai-context';
import { cn } from '@/lib/utils';
import type { AiConversation, AiMessage, UploadResult } from '@/lib/types';
import { SharedPostPreview } from '@/components/feed/SharedPostPreview';
import { AiAuroraBackground } from './AiAuroraBackground';
import { AiAvatar } from './AiAvatar';
import { AiMarkdown } from './AiMarkdown';
import { AiMessageBubble } from './AiMessageBubble';

const SUGGESTIONS = [
  { text: 'اشرح لي هذه المحاضرة', icon: BookOpen },
  { text: 'ساعدني في فهم الواجب', icon: ClipboardList },
  { text: 'لخّص لي هذا الموضوع', icon: FileText },
];

const TOOL_LABELS: Record<string, string> = {
  list_planner_tasks: 'يتحقق من مهامك...',
  create_planner_task: 'يضيف مهمة...',
  complete_planner_task: 'يُنجز مهمة...',
  remove_planner_task: 'يحذف مهمة...',
  list_assignments: 'يتحقق من واجباتك...',
  complete_assignment: 'يُكمل واجبًا...',
  read_post_thread: 'يقرأ منشورًا...',
  search_qa: 'يبحث في الأسئلة والأجوبة...',
  search_groups: 'يبحث عن مجموعات...',
  send_chat_message: 'يرسل رسالة...',
  remember_about_me: 'يحفظ معلومة...',
  forget_my_memory: 'يحذف الذاكرة...',
};

function toolStatusLabel(name: string): string {
  return TOOL_LABELS[name] ?? 'ينفذ إجراءً...';
}

const NEAR_BOTTOM_THRESHOLD = 120;

type PendingAttachment = AiMessageAttachment & { name: string };

export function AiChatPanel({
  conversationId,
  onConversationCreated,
}: {
  conversationId: string | null;
  onConversationCreated: (conversation: AiConversation) => void;
}) {
  const { addConversation, pendingShare, clearPendingShare } = useAi();
  const { showToast } = useToast();

  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [loading, setLoading] = useState(!!conversationId);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [streamingStatus, setStreamingStatus] = useState<string | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastFailedText = useRef('');
  const lastFailedAttachment = useRef<AiMessageAttachment | undefined>(undefined);
  const lastFailedSharedPostId = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api.get<AiMessage[]>(`/ai/conversations/${conversationId}/messages`).then((data) => {
      if (cancelled) return;
      setMessages(data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, sending, streamingText]);

  useEffect(() => {
    textareaRef.current!.style.height = 'auto';
    textareaRef.current!.style.height = `${Math.min(textareaRef.current!.scrollHeight, 128)}px`;
  }, [text]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowJumpToBottom(distance > NEAR_BOTTOM_THRESHOLD);
  }

  function scrollToBottom() {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const result = await api.upload<UploadResult>('/upload/file', file);
      setPendingAttachment({
        url: result.url,
        type: file.type.startsWith('image/') ? 'image' : 'document',
        mimeType: result.mimeType,
        name: file.name,
      });
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر رفع الملف', 'error');
    } finally {
      setUploading(false);
    }
  }

  async function sendText(trimmed: string, attachment?: PendingAttachment, sharedPostId?: string) {
    if (!trimmed || sending) return;
    setSending(true);
    setFailedId(null);
    setStreamingText('');
    setStreamingStatus(null);

    // Backend streams the assistant's reply live (the user message is persisted server-side too,
    // so a future refetch shows both) -- echo it optimistically here for instant feedback.
    const optimisticId = `temp-${Date.now()}`;
    const optimisticUser: AiMessage = {
      _id: optimisticId,
      conversation: conversationId ?? '',
      role: 'user',
      text: trimmed,
      attachmentUrl: attachment?.url,
      attachmentType: attachment?.type,
      sharedPostId,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUser]);
    setPendingAttachment(null);
    if (sharedPostId) clearPendingShare();

    try {
      let activeId = conversationId;
      if (!activeId) {
        const conversation = await api.post<AiConversation>('/ai/conversations');
        addConversation(conversation);
        onConversationCreated(conversation);
        activeId = conversation._id;
      }

      await streamAiMessage(
        activeId,
        trimmed,
        (event) => {
          if (event.type === 'delta') {
            setStreamingText((prev) => prev + event.text);
          } else if (event.type === 'tool_call') {
            setStreamingStatus(`🔧 ${toolStatusLabel(event.name)}`);
          } else if (event.type === 'tool_result') {
            setStreamingStatus(event.summary);
          } else if (event.type === 'done') {
            setMessages((prev) => [...prev, event.message]);
            setStreamingText('');
            setStreamingStatus(null);
          } else if (event.type === 'error') {
            throw new ApiError(0, event.message);
          }
        },
        attachment ? { url: attachment.url, type: attachment.type, mimeType: attachment.mimeType } : undefined,
        sharedPostId,
      );
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر التواصل مع المساعد الذكي', 'error');
      lastFailedText.current = trimmed;
      lastFailedAttachment.current = attachment ? { url: attachment.url, type: attachment.type, mimeType: attachment.mimeType } : undefined;
      lastFailedSharedPostId.current = sharedPostId;
      setFailedId(optimisticId);
      setStreamingText('');
      setStreamingStatus(null);
    } finally {
      setSending(false);
    }
  }

  function handleRetry() {
    setMessages((prev) => prev.filter((m) => m._id !== failedId));
    setFailedId(null);
    const attachment = lastFailedAttachment.current;
    sendText(lastFailedText.current, attachment ? { ...attachment, name: '' } : undefined, lastFailedSharedPostId.current);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    setText('');
    const attachment = pendingAttachment;
    sendText(trimmed, attachment ?? undefined, pendingShare?._id);
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <AiAuroraBackground />
      <div ref={scrollRef} onScroll={handleScroll} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 scrollbar-thin">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Spinner className="h-6 w-6" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-4 text-center">
            <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-accent text-white shadow-glow">
              <div className="absolute inset-0 -z-10 animate-pulse-glow rounded-full" />
              <AiAvatar size={34} />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">أهلًا! أنا مساعدك الذكي</p>
              <p className="mt-1 text-sm text-muted-foreground">اسأل عن واجباتك أو محاضراتك، أو اختر أحد الاقتراحات:</p>
            </div>
            <div className="grid w-full max-w-xs grid-cols-1 gap-2">
              {SUGGESTIONS.map(({ text: s, icon: Icon }) => (
                <button
                  key={s}
                  onClick={() => sendText(s)}
                  className="flex items-center gap-2.5 rounded-xl border border-border bg-surface-2/50 px-3.5 py-2.5 text-start text-sm text-foreground backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:bg-surface-2/80 hover:shadow-glow active:scale-[0.98]"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <AiMessageBubble key={message._id} message={message} failed={message._id === failedId} onRetry={handleRetry} />
          ))
        )}

        {sending && (
          <div className="flex items-end gap-2 animate-slide-up">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-accent text-white">
              <AiAvatar size={18} />
            </div>
            {streamingText ? (
              <div className="flex max-w-[80%] flex-col gap-1 items-start">
                <div className="relative rounded-2xl rounded-br-md border border-s-2 border-border border-s-accent/50 bg-surface-2/60 px-4 py-2.5 text-[15px] leading-relaxed text-foreground backdrop-blur-sm">
                  <AiMarkdown text={streamingText} />
                  <span className="ms-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-accent align-middle" />
                </div>
                {streamingStatus && (
                  <span className="flex items-center gap-1 px-1 text-[11px] text-muted-foreground">
                    <Sparkles className="h-3 w-3 text-accent" />
                    {streamingStatus}
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-2xl rounded-br-md border border-border bg-surface-2/60 px-3.5 py-2.5 backdrop-blur-sm">
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-accent" />
                <span className="bg-gradient-to-r from-muted-foreground via-foreground to-muted-foreground bg-[length:200%_100%] bg-clip-text text-sm text-transparent motion-safe:animate-shimmer">
                  {streamingStatus || 'المساعد يفكر...'}
                </span>
              </div>
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {showJumpToBottom && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-20 left-1/2 z-10 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground shadow-soft transition-transform hover:scale-110 hover:text-foreground active:scale-95"
        >
          <ArrowDown className="h-4 w-4" />
        </button>
      )}

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-2 border-t border-border p-3 backdrop-blur-sm transition-shadow focus-within:shadow-glow"
      >
        {pendingShare && (
          <div className="relative max-h-40 overflow-y-auto">
            <button
              type="button"
              onClick={clearPendingShare}
              title="إزالة المنشور"
              className="absolute end-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground shadow-soft hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
            <SharedPostPreview post={pendingShare} />
          </div>
        )}
        {pendingAttachment && (
          <div className="flex w-fit items-center gap-1.5 rounded-full border border-border bg-surface-2/70 px-2.5 py-1 text-[11px] text-muted-foreground">
            <Paperclip className="h-3 w-3" />
            <span className="max-w-[10rem] truncate">{pendingAttachment.name}</span>
            <button type="button" onClick={() => setPendingAttachment(null)} className="text-muted-foreground hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelected} />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || sending}
            title="إرفاق ملف أو صورة"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2/70 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
          >
            {uploading ? <Spinner className="h-4 w-4" /> : <Paperclip className="h-4 w-4" />}
          </button>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            rows={1}
            placeholder="اسأل عن واجب أو محاضرة..."
            className="max-h-32 flex-1 resize-none rounded-2xl border border-transparent bg-surface-2/70 px-4 py-2.5 text-sm leading-relaxed transition-colors focus:border-accent/40 focus:bg-surface focus:outline-none"
          />
          <button
            type="submit"
            disabled={!text.trim() || sending}
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-accent text-white shadow-soft transition-transform hover:scale-110 hover:shadow-glow active:scale-95 disabled:opacity-40 disabled:hover:scale-100 disabled:hover:shadow-soft',
              !!text.trim() && !sending && 'motion-safe:animate-breathe',
            )}
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
