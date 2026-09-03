'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  BookOpen,
  ClipboardList,
  FileText,
  Paperclip,
  Send,
  Sparkles,
  StopCircle,
  X,
} from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { api, ApiError, regenerateAiMessage, streamAiMessage, type AiMessageAttachment, type AiStreamEvent } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { useAuth } from '@/lib/auth-context';
import { useAi } from '@/lib/ai-context';
import { cn } from '@/lib/utils';
import type { AiConversation, AiMessage, UploadResult } from '@/lib/types';
import { SharedPostPreview } from '@/components/feed/SharedPostPreview';
import { AiAuroraBackground } from './AiAuroraBackground';
import { AiAvatar } from './AiAvatar';
import { AiMarkdown } from './AiMarkdown';
import { AiUsageMeter } from './AiUsageMeter';
import { AiPersonalizeCard, assistantDisplayName, personalizeDismissed } from './AiPersonalizeCard';
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

interface StreamingState {
  text: string;
  status: string | null;
  stub: boolean;
}

const EMPTY_STREAMING_STATE: StreamingState = { text: '', status: null, stub: false };

// Holds the in-flight reply's text/status outside of React state entirely. A streamed reply can
// arrive at dozens of tokens/second -- routing each one through AiChatPanel's own state would
// re-render the whole panel (and every prior message bubble) per token. Writers (sendText,
// handleRegenerate) mutate this store directly; only AiStreamingBubble subscribes to it via
// useSyncExternalStore below, so it's the only thing that re-renders per token.
function createStreamingStore() {
  let state = EMPTY_STREAMING_STATE;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());
  return {
    reset() {
      state = EMPTY_STREAMING_STATE;
      notify();
    },
    appendDelta(delta: string, stub?: boolean) {
      state = { text: state.text + delta, status: state.status, stub: state.stub || !!stub };
      notify();
    },
    setStatus(status: string | null) {
      state = { ...state, status };
      notify();
    },
    getSnapshot() {
      return state;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

type StreamingStore = ReturnType<typeof createStreamingStore>;

// Renders the "assistant is replying" block. Subscribes directly to the streaming store instead
// of receiving text/status as props, so it re-renders on every token without AiChatPanel (or any
// message bubble) re-rendering at all.
function AiStreamingBubble({ store, onTextChange }: { store: StreamingStore; onTextChange: () => void }) {
  const { text, status, stub } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  useEffect(() => {
    onTextChange();
    // Only scroll when new text actually arrives, not on every render of this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return (
    <div className="flex items-end gap-2 animate-slide-up">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-accent text-white">
        <AiAvatar size={18} />
      </div>
      {text ? (
        <div className="flex min-w-0 max-w-[calc(100%-2.5rem)] flex-col items-start gap-1 sm:max-w-[85%]">
          {stub && (
            <span className="flex items-center gap-1 px-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3 w-3" />
              رافد غير مُفعّل بعد على الخادم
            </span>
          )}
          <div
            className={cn(
              'relative min-w-0 max-w-full break-words rounded-2xl rounded-br-md border px-4 py-2.5 text-[15px] leading-relaxed backdrop-blur-sm',
              stub
                ? 'border-amber-500/30 border-s-2 border-s-amber-500/60 bg-amber-500/10 text-foreground'
                : 'border-border border-s-2 border-s-accent/50 bg-surface-2/60 text-foreground',
            )}
          >
            <AiMarkdown text={text} />
            <span
              className={cn(
                'ms-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse align-middle',
                stub ? 'bg-amber-500' : 'bg-accent',
              )}
            />
          </div>
          {status && (
            <span className="flex items-center gap-1 px-1 text-[11px] text-muted-foreground">
              <Sparkles className="h-3 w-3 text-accent" />
              {status}
            </span>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-2xl rounded-br-md border border-border bg-surface-2/60 px-3.5 py-2.5 backdrop-blur-sm">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-accent" />
          <span className="bg-gradient-to-r from-muted-foreground via-foreground to-muted-foreground bg-[length:200%_100%] bg-clip-text text-sm text-transparent motion-safe:animate-shimmer">
            {status || 'رافد يفكر...'}
          </span>
        </div>
      )}
    </div>
  );
}

export function AiChatPanel({
  conversationId,
  onConversationCreated,
}: {
  conversationId: string | null;
  onConversationCreated: (conversation: AiConversation) => void;
}) {
  const { addConversation, pendingShare, clearPendingShare, usage, bumpUsage, refreshUsage } = useAi();
  const { user } = useAuth();
  const { showToast } = useToast();

  // First-run "name me / name you" card in the empty state, until the student fills it or skips.
  const [personalizeSkipped, setPersonalizeSkipped] = useState(false);
  useEffect(() => setPersonalizeSkipped(personalizeDismissed()), []);
  const showPersonalize = !user?.aiAssistantName && !personalizeSkipped;

  // Daily question quota is spent -- block sending and show a "come back after N hours" notice.
  const exhausted = !!usage && usage.remaining <= 0;
  const hoursToReset = usage
    ? Math.max(1, Math.ceil((new Date(usage.resetsAt).getTime() - Date.now()) / 3_600_000))
    : 24;

  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [loading, setLoading] = useState(!!conversationId);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
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
  const streamingStoreRef = useRef<StreamingStore | null>(null);
  if (!streamingStoreRef.current) streamingStoreRef.current = createStreamingStore();
  const streamingStore = streamingStoreRef.current;
  const abortRef = useRef<AbortController | null>(null);

  const loadMessages = useCallback(() => {
    if (!conversationId) {
      setMessages([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    api.get<AiMessage[]>(`/ai/conversations/${conversationId}/messages`).then((data) => {
      setMessages(data);
      setLoading(false);
    });
  }, [conversationId]);

  useEffect(() => {
    let cancelled = false;
    if (!conversationId) {
      setMessages([]);
      setLoading(false);
      return;
    }
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
  }, [messages.length, sending]);

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

  // Shared by sendText and handleRegenerate: writes streamed events into the external store
  // (not React state -- see createStreamingStore) so a token doesn't re-render the whole panel.
  function makeStreamEventHandler(): (event: AiStreamEvent) => void {
    return (event) => {
      if (event.type === 'delta') {
        streamingStore.appendDelta(event.text, event.stub);
      } else if (event.type === 'tool_call') {
        streamingStore.setStatus(`🔧 ${toolStatusLabel(event.name)}`);
      } else if (event.type === 'tool_result') {
        streamingStore.setStatus(event.summary);
      } else if (event.type === 'done') {
        setMessages((prev) => [...prev, event.message]);
        streamingStore.reset();
      } else if (event.type === 'error') {
        throw new ApiError(0, event.message);
      }
    };
  }

  function isAbortError(err: unknown): boolean {
    return err instanceof DOMException && err.name === 'AbortError';
  }

  async function sendText(trimmed: string, attachment?: PendingAttachment, sharedPostId?: string) {
    if (!trimmed || sending || exhausted) return;
    setSending(true);
    setFailedId(null);
    streamingStore.reset();

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
    // The backend persists this user message immediately (so it already counts against the quota) --
    // move the meter now; the finally-block refetch reconciles the exact number.
    bumpUsage();

    const controller = new AbortController();
    abortRef.current = controller;

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
        makeStreamEventHandler(),
        attachment ? { url: attachment.url, type: attachment.type, mimeType: attachment.mimeType } : undefined,
        sharedPostId,
        controller.signal,
      );
    } catch (err) {
      streamingStore.reset();
      if (isAbortError(err)) {
        // The backend still saves whatever partial reply it had generated when the connection
        // dropped -- give that save a moment to land, then refetch the authoritative list instead
        // of guessing at what the partial reply looked like.
        setTimeout(loadMessages, 450);
      } else {
        showToast(err instanceof ApiError ? err.message : 'تعذّر التواصل مع رافد', 'error');
        lastFailedText.current = trimmed;
        lastFailedAttachment.current = attachment ? { url: attachment.url, type: attachment.type, mimeType: attachment.mimeType } : undefined;
        lastFailedSharedPostId.current = sharedPostId;
        setFailedId(optimisticId);
      }
    } finally {
      setSending(false);
      abortRef.current = null;
      // Reconcile the optimistic bump (and pick up a server-side quota rejection) with the truth.
      void refreshUsage();
    }
  }

  // Deletes the last assistant reply and asks for a fresh one to the same question. Only valid
  // while the conversation's last message is a non-stub assistant reply -- see canRegenerateLast.
  async function handleRegenerate() {
    if (sending || !conversationId) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant') return;

    setSending(true);
    streamingStore.reset();
    setMessages((prev) => prev.slice(0, -1));

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await regenerateAiMessage(conversationId, makeStreamEventHandler(), controller.signal);
    } catch (err) {
      streamingStore.reset();
      if (isAbortError(err)) {
        setTimeout(loadMessages, 450);
      } else {
        showToast(err instanceof ApiError ? err.message : 'تعذّر إعادة توليد الرد', 'error');
        setMessages((prev) => [...prev, last]);
      }
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  }

  const handleRetry = useCallback(() => {
    setFailedId((currentFailedId) => {
      setMessages((prev) => prev.filter((m) => m._id !== currentFailedId));
      return null;
    });
    const attachment = lastFailedAttachment.current;
    sendText(lastFailedText.current, attachment ? { ...attachment, name: '' } : undefined, lastFailedSharedPostId.current);
    // sendText/setMessages are stable enough in practice (refs + functional updates); re-created
    // only when failedId itself changes, which is exactly when this handler's behavior must change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-3 py-4 scrollbar-thin sm:px-4"
      >
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
              <p className="text-sm font-medium text-foreground">
                {user?.aiPreferredName ? `أهلًا ${user.aiPreferredName}! ` : 'أهلًا! '}
                أنا {assistantDisplayName(user)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">اسأل عن واجباتك أو محاضراتك، أو اختر أحد الاقتراحات:</p>
            </div>
            {showPersonalize && (
              <div className="w-full max-w-xs">
                <AiPersonalizeCard onSkip={() => setPersonalizeSkipped(true)} />
              </div>
            )}
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
          messages.map((message, i) => {
            const isLast = i === messages.length - 1;
            const canRegenerate = isLast && !sending && message.role === 'assistant' && !message.stub;
            return (
              <AiMessageBubble
                key={message._id}
                message={message}
                failed={message._id === failedId}
                onRetry={handleRetry}
                canRegenerate={canRegenerate}
                onRegenerate={canRegenerate ? handleRegenerate : undefined}
              />
            );
          })
        )}

        {sending && <AiStreamingBubble store={streamingStore} onTextChange={scrollToBottom} />}
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
        className="flex shrink-0 flex-col gap-2 border-t border-border p-3 backdrop-blur-sm transition-shadow focus-within:shadow-glow"
      >
        {usage && (
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="text-[11px] text-muted-foreground">
              {exhausted ? 'انتهى رصيد اليوم' : 'أسئلة اليوم'}
            </span>
            <AiUsageMeter used={usage.used} limit={usage.limit} showLabel />
          </div>
        )}
        {exhausted && (
          <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-[12px] leading-relaxed text-danger">
            بلغت الحد الأقصى اليومي ({usage!.limit} سؤالًا) مع رافد. يتجدّد رصيدك بعد منتصف الليل — عد بعد نحو{' '}
            {hoursToReset} ساعة.
          </p>
        )}
        {pendingShare && (
          <div className="relative max-h-40 overflow-y-auto overflow-x-hidden">
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
            disabled={uploading || sending || exhausted}
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
            disabled={exhausted}
            placeholder={exhausted ? 'عد غدًا لطرح المزيد من الأسئلة' : 'اسأل عن واجب أو محاضرة...'}
            className="max-h-32 min-w-0 flex-1 resize-none rounded-2xl border border-transparent bg-surface-2/70 px-4 py-2.5 text-sm leading-relaxed transition-colors focus:border-accent/40 focus:bg-surface focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          />
          {sending ? (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              title="إيقاف التوليد"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-foreground shadow-soft transition-transform hover:scale-110 active:scale-95"
            >
              <StopCircle className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!text.trim() || exhausted}
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-accent text-white shadow-soft transition-transform hover:scale-110 hover:shadow-glow active:scale-95 disabled:opacity-40 disabled:hover:scale-100 disabled:hover:shadow-soft',
                !!text.trim() && !exhausted && 'motion-safe:animate-breathe',
              )}
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
