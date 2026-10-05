'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BarChart3,
  BellOff,
  CalendarClock,
  Camera,
  ChevronUp,
  FileText,
  Film,
  Image as ImageIcon,
  Loader2,
  Mic,
  Pencil,
  Plus,
  Reply,
  Send,
  Smile,
  Sparkles,
  Undo2,
  Wand2,
  X,
} from 'lucide-react';
import { MentionTextarea } from '@/components/shared/MentionTextarea';
import { api, ApiError } from '@/lib/api';
import { chatApi } from '@/lib/chat-api';
import { EFFECTS, EFFECT_META } from '@/lib/chat-effects';
import { getDraft, setDraft } from '@/lib/chat-drafts';
import { messagePreview } from '@/lib/chat-helpers';
import { haptic } from '@/lib/haptics';
import { cldOptimize } from '@/lib/images';
import { useLongPress } from '@/lib/use-long-press';
import { useToast } from '@/lib/toast-context';
import { assetUrl, cn, formatBytes } from '@/lib/utils';
import type { Attachment, AttachmentType, ChatRewriteMode, Message, MessageEffect } from '@/lib/types';
import { EmojiPicker } from './EmojiPicker';
import { ScheduleSendModal } from './ChatModals';
import { VoiceRecorder } from './VoiceRecorder';

export interface SendPayload {
  text: string;
  attachments?: Attachment[];
  effect?: MessageEffect | null;
  silent?: boolean;
  /** ISO time -- schedule instead of sending now. */
  scheduleAt?: string;
}

export interface MessageInputHandle {
  addFiles: (files: File[]) => void;
  focus: () => void;
  /** Put text into the composer (appended on a new line if something's already there). */
  insertText: (text: string) => void;
}

interface MessageInputProps {
  conversationId: string;
  /** Resolve false to keep the composer contents (e.g. scheduling failed). */
  onSend: (payload: SendPayload) => Promise<boolean> | boolean;
  onTyping: () => void;
  onStopTyping: () => void;
  replyingTo?: Message | null;
  onCancelReply: () => void;
  editingMessage?: Message | null;
  onCancelEdit: () => void;
  onSubmitEdit: (messageId: string, text: string) => void;
  /** ↑ in an empty composer: edit my last message. */
  onEditLast: () => void;
  onCreatePoll: () => void;
  onOpenSummary: () => void;
  scheduledCount: number;
  onOpenScheduled: () => void;
  /** Voice recording started/stopped -- drives the "يسجل رسالة صوتية…" indicator for others. */
  onRecordingChange?: (active: boolean) => void;
}

const MAX_FILES = 10;

function categoryForMime(mimeType: string): { endpoint: string; type: AttachmentType } {
  if (mimeType.startsWith('image/')) return { endpoint: '/upload/file', type: 'image' };
  if (mimeType.startsWith('video/')) return { endpoint: '/upload/video', type: 'video' };
  if (mimeType.startsWith('audio/')) return { endpoint: '/upload/audio', type: 'audio' };
  return { endpoint: '/upload/file', type: 'document' };
}

interface SlashCommand {
  id: 'poll' | 'schedule' | 'summary' | 'reply' | 'silent' | MessageEffect | 'shrug';
  keys: string[];
  label: string;
  hint: string;
  icon: string;
}

const SLASH_COMMANDS: SlashCommand[] = [
  { id: 'poll', keys: ['poll', 'vote', 'استطلاع'], label: 'استطلاع', hint: 'أنشئ استطلاعًا للتصويت', icon: '📊' },
  { id: 'schedule', keys: ['schedule', 'later', 'جدولة'], label: 'جدولة', hint: 'اختر وقت إرسال رسالتك التالية', icon: '🕒' },
  { id: 'summary', keys: ['summary', 'tldr', 'ملخص'], label: 'ملخص ذكي', hint: 'لخّص المحادثة بالذكاء الاصطناعي', icon: '✨' },
  { id: 'reply', keys: ['reply', 'suggest', 'رد'], label: 'اقترح ردًا', hint: 'ردود مقترحة بالذكاء الاصطناعي', icon: '💡' },
  { id: 'silent', keys: ['silent', 'quiet', 'صامت'], label: 'بدون صوت', hint: 'أرسل رسالتك التالية بلا إشعار', icon: '🔕' },
  { id: 'confetti', keys: ['confetti', 'party', 'احتفال'], label: 'تأثير احتفال', hint: 'أرسل مع قصاصات ملوّنة', icon: '🎉' },
  { id: 'hearts', keys: ['hearts', 'love', 'قلوب'], label: 'تأثير قلوب', hint: 'أرسل مع قلوب طائرة', icon: '❤️' },
  { id: 'fireworks', keys: ['fireworks', 'ألعاب'], label: 'ألعاب نارية', hint: 'أرسل مع ألعاب نارية', icon: '🎆' },
  { id: 'stars', keys: ['stars', 'sparkle', 'نجوم'], label: 'تأثير نجوم', hint: 'أرسل مع نجوم لامعة', icon: '✨' },
  { id: 'shrug', keys: ['shrug'], label: '¯\\_(ツ)_/¯', hint: 'أدرج الكتفين المرفوعتين', icon: '🤷' },
];

const REWRITE_MODES: { mode: ChatRewriteMode; label: string }[] = [
  { mode: 'improve', label: 'حسّن الصياغة' },
  { mode: 'fix', label: 'صحّح الأخطاء' },
  { mode: 'formal', label: 'أسلوب رسمي' },
  { mode: 'friendly', label: 'أسلوب ودّي' },
  { mode: 'shorter', label: 'اختصر' },
  { mode: 'en', label: 'ترجم إلى الإنجليزية' },
  { mode: 'ar', label: 'ترجم إلى العربية' },
];

type Armed = { silent?: boolean; effect?: MessageEffect; schedule?: boolean };

type SmartState = { status: 'loading' | 'done' | 'error'; replies: string[]; error?: string } | null;

function Popover({ open, className, children }: { open: boolean; className?: string; children: React.ReactNode }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 520, damping: 34 }}
          className={cn(
            'absolute bottom-full z-40 mb-2 rounded-2xl border border-border/70 bg-surface/95 p-1.5 shadow-elev-4 backdrop-blur-xl',
            className,
          )}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Closes a popover on any pointer-down outside `ref`.
function useDismiss(open: boolean, ref: React.RefObject<HTMLElement>, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, ref, onClose]);
}

export const MessageInput = forwardRef<MessageInputHandle, MessageInputProps>(function MessageInput(
  {
    conversationId,
    onSend,
    onTyping,
    onStopTyping,
    replyingTo,
    onCancelReply,
    editingMessage,
    onCancelEdit,
    onSubmitEdit,
    onEditLast,
    onCreatePoll,
    onOpenSummary,
    scheduledCount,
    onOpenScheduled,
    onRecordingChange,
  },
  ref,
) {
  const { showToast } = useToast();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const attachWrapRef = useRef<HTMLDivElement>(null);
  const sendWrapRef = useRef<HTMLDivElement>(null);
  const aiWrapRef = useRef<HTMLDivElement>(null);

  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ label: string; pct: number } | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [sendMenuOpen, setSendMenuOpen] = useState(false);
  const [aiMenuOpen, setAiMenuOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [armed, setArmed] = useState<Armed>({});
  const [aiBusy, setAiBusy] = useState(false);
  const [undoText, setUndoText] = useState<string | null>(null);
  const [smart, setSmart] = useState<SmartState>(null);
  const [slashIndex, setSlashIndex] = useState(0);

  const textRef = useRef(text);
  textRef.current = text;
  const stashRef = useRef<string | null>(null);
  // Set by any user-driven change. The unmount flush below only runs when this is true: under
  // React StrictMode's simulated unmount the saved draft hasn't even been loaded into state yet,
  // and flushing that empty initial text would erase it.
  const dirtyRef = useRef(false);
  const editText = useCallback((value: React.SetStateAction<string>) => {
    dirtyRef.current = true;
    setText(value);
  }, []);

  // --- drafts: restore on open, debounce-save while typing, flush on leave ---
  useEffect(() => {
    setText(getDraft(conversationId));
    return () => {
      if (!dirtyRef.current) return;
      // Mid-edit, the real draft is the one stashed away -- not the message being edited.
      setDraft(conversationId, stashRef.current !== null ? stashRef.current : textRef.current);
    };
  }, [conversationId]);

  useEffect(() => {
    if (editingMessage) return;
    const handle = setTimeout(() => setDraft(conversationId, text), 350);
    return () => clearTimeout(handle);
  }, [text, conversationId, editingMessage]);

  // Editing swaps the draft out for the message's text, and swaps it back afterwards.
  useEffect(() => {
    if (editingMessage) {
      if (stashRef.current === null) stashRef.current = textRef.current;
      setText(editingMessage.text ?? '');
      requestAnimationFrame(() => textareaRef.current?.focus());
    } else if (stashRef.current !== null) {
      setText(stashRef.current);
      stashRef.current = null;
    }
  }, [editingMessage]);

  useEffect(() => {
    if (replyingTo) requestAnimationFrame(() => textareaRef.current?.focus());
  }, [replyingTo]);

  useEffect(() => {
    const urls = files.map((file) =>
      file.type.startsWith('image/') || file.type.startsWith('video/') ? URL.createObjectURL(file) : '',
    );
    setPreviewUrls(urls);
    return () => urls.forEach((url) => url && URL.revokeObjectURL(url));
  }, [files]);

  // Autosize the textarea up to ~6 lines.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [text]);

  const addFiles = useCallback(
    (incoming: File[]) => {
      if (!incoming.length) return;
      setFiles((prev) => {
        const room = MAX_FILES - prev.length;
        if (room <= 0) {
          showToast(`يمكنك إرفاق ${MAX_FILES} ملفات كحد أقصى في الرسالة.`, 'error');
          return prev;
        }
        if (incoming.length > room) showToast(`أُضيف ${room} فقط — الحد ${MAX_FILES} ملفات.`, 'error');
        return [...prev, ...incoming.slice(0, room)];
      });
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
    [showToast],
  );

  useImperativeHandle(
    ref,
    () => ({
      addFiles,
      focus: () => textareaRef.current?.focus(),
      insertText: (value: string) => {
        editText((prev) => (prev.trim() ? `${prev.trimEnd()}\n${value}` : value));
        requestAnimationFrame(() => textareaRef.current?.focus());
      },
    }),
    [addFiles, editText],
  );

  // Tell the conversation while a voice note is being recorded (and stop when it ends/unmounts).
  const recordingCallback = useRef(onRecordingChange);
  recordingCallback.current = onRecordingChange;
  useEffect(() => {
    if (!recording) return;
    recordingCallback.current?.(true);
    return () => recordingCallback.current?.(false);
  }, [recording]);

  const closeMenus = useCallback(() => {
    setAttachOpen(false);
    setSendMenuOpen(false);
    setAiMenuOpen(false);
  }, []);
  useDismiss(attachOpen, attachWrapRef, () => setAttachOpen(false));
  useDismiss(sendMenuOpen, sendWrapRef, () => setSendMenuOpen(false));
  useDismiss(aiMenuOpen, aiWrapRef, () => setAiMenuOpen(false));

  async function uploadFile(file: File, index: number, total: number): Promise<Attachment> {
    const { endpoint, type } = categoryForMime(file.type);
    const prefix = total > 1 ? `(${index + 1}/${total}) ` : '';
    setProgress({ label: `${prefix}${type === 'video' ? 'جارٍ تجهيز الفيديو…' : 'جارٍ الرفع…'}`, pct: 0 });
    const uploaded = await api.upload<{ url: string; size: number; mimeType: string; chunkCount?: number }>(
      endpoint,
      file,
      (pct) => setProgress({ label: `${prefix}جارٍ الرفع…`, pct: Math.round(pct) }),
    );
    // chunkCount > 1: too large for one Cloudinary asset and split on upload -- must travel with
    // the url so the backend can reassemble it on read (see BubbleCard.openDocument).
    return { url: uploaded.url, type, name: file.name, size: uploaded.size, mimeType: uploaded.mimeType, chunkCount: uploaded.chunkCount };
  }

  async function send(options: { effect?: MessageEffect | null; silent?: boolean; scheduleAt?: string } = {}) {
    closeMenus();
    if (editingMessage) {
      if (!text.trim()) return;
      onSubmitEdit(editingMessage._id, text.trim());
      return;
    }
    const trimmed = text.trim();
    if ((!trimmed && files.length === 0) || uploading) return;

    let attachments: Attachment[] | undefined;
    if (files.length) {
      setUploading(true);
      try {
        // Sequential: videos may be re-encoded on the CPU first; parallel would just thrash.
        const done: Attachment[] = [];
        for (let i = 0; i < files.length; i++) done.push(await uploadFile(files[i], i, files.length));
        attachments = done;
      } catch (err) {
        showToast(err instanceof ApiError ? err.message : 'تعذّر إرفاق الملف.', 'error');
        setUploading(false);
        setProgress(null);
        return;
      }
      setUploading(false);
      setProgress(null);
    }

    const ok = await onSend({
      text: trimmed,
      attachments,
      effect: options.effect ?? armed.effect ?? null,
      silent: options.silent ?? armed.silent ?? false,
      scheduleAt: options.scheduleAt,
    });
    if (ok === false) return;
    haptic('tap');
    editText('');
    setFiles([]);
    setArmed({});
    setSmart(null);
    setUndoText(null);
    setDraft(conversationId, '');
    onCancelReply();
  }

  function primarySend() {
    if (armed.schedule && !editingMessage) {
      setScheduleOpen(true);
      return;
    }
    void send();
  }

  const { handlers: sendPressHandlers, consumeLongPress } = useLongPress<HTMLButtonElement>(() => {
    if (!editingMessage && (text.trim() || files.length)) setSendMenuOpen(true);
  });

  async function suggestReplies() {
    closeMenus();
    setSmart({ status: 'loading', replies: [] });
    try {
      const { replies } = await chatApi.ai.replies(conversationId);
      setSmart({ status: 'done', replies });
    } catch (err) {
      setSmart({ status: 'error', replies: [], error: err instanceof ApiError ? err.message : 'تعذّر جلب الاقتراحات' });
    }
  }

  async function rewrite(mode: ChatRewriteMode) {
    setAiMenuOpen(false);
    const original = text;
    if (!original.trim()) return;
    setAiBusy(true);
    try {
      const { text: out } = await chatApi.ai.rewrite(original, mode);
      editText(out);
      setUndoText(original);
      haptic('success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّرت إعادة الصياغة.', 'error');
    } finally {
      setAiBusy(false);
    }
  }

  // --- slash commands ---
  const slashMatch = !editingMessage ? /^\/(\S*)$/.exec(text) : null;
  const slashQuery = slashMatch ? slashMatch[1].toLowerCase() : null;
  const slashResults =
    slashQuery === null
      ? []
      : SLASH_COMMANDS.filter((c) => !slashQuery || c.keys.some((k) => k.startsWith(slashQuery)) || c.label.includes(slashQuery));

  useEffect(() => setSlashIndex(0), [slashQuery]);

  function runCommand(command: SlashCommand) {
    editText('');
    haptic('select');
    switch (command.id) {
      case 'poll':
        onCreatePoll();
        break;
      case 'schedule':
        setArmed((a) => ({ ...a, schedule: true }));
        break;
      case 'summary':
        onOpenSummary();
        break;
      case 'reply':
        void suggestReplies();
        break;
      case 'silent':
        setArmed((a) => ({ ...a, silent: true }));
        break;
      case 'shrug':
        editText('¯\\_(ツ)_/¯ ');
        break;
      default:
        setArmed((a) => ({ ...a, effect: command.id as MessageEffect }));
    }
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  // Ctrl/Cmd + B / I / E, Ctrl/Cmd + Shift + X: wrap the selection in *bold* / _italic_ / `code` / ~strike~.
  function wrapSelection(marker: string): boolean {
    const el = textareaRef.current;
    if (!el || el.value !== text) return false; // mention markup present -- offsets wouldn't line up
    const { selectionStart: start, selectionEnd: end } = el;
    if (start === end) return false;
    const next = text.slice(0, start) + marker + text.slice(start, end) + marker + text.slice(end);
    editText(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + marker.length, end + marker.length);
    });
    return true;
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (slashResults.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashIndex((i) => (e.key === 'ArrowDown' ? (i + 1) % slashResults.length : (i - 1 + slashResults.length) % slashResults.length));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        runCommand(slashResults[slashIndex] ?? slashResults[0]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        editText('');
        return;
      }
    }

    const mod = e.metaKey || e.ctrlKey;
    if (mod && !e.altKey) {
      const key = e.key.toLowerCase();
      const marker = key === 'b' ? '*' : key === 'i' ? '_' : key === 'e' ? '`' : key === 'x' && e.shiftKey ? '~' : null;
      if (marker && wrapSelection(marker)) {
        e.preventDefault();
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      primarySend();
      return;
    }
    if (e.key === 'ArrowUp' && !text && !files.length && !editingMessage && !e.shiftKey) {
      e.preventDefault();
      onEditLast();
      return;
    }
    if (e.key === 'Escape') {
      if (editingMessage) onCancelEdit();
      else if (replyingTo) onCancelReply();
      else if (smart) setSmart(null);
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    const pasted = Array.from(e.clipboardData?.files ?? []);
    if (!pasted.length) return;
    e.preventDefault();
    addFiles(pasted);
  }

  const hasContent = !!text.trim() || files.length > 0;
  const replyPreviewImage = replyingTo?.attachments?.find((a) => a.type === 'image');

  const attachItems = [
    { key: 'media', label: 'صور وفيديو', icon: ImageIcon, tone: 'from-violet-500 to-indigo-500', run: () => mediaInputRef.current?.click() },
    { key: 'camera', label: 'الكاميرا', icon: Camera, tone: 'from-rose-500 to-pink-500', run: () => cameraInputRef.current?.click() },
    { key: 'doc', label: 'مستند', icon: FileText, tone: 'from-sky-500 to-blue-600', run: () => fileInputRef.current?.click() },
    { key: 'poll', label: 'استطلاع', icon: BarChart3, tone: 'from-amber-400 to-orange-500', run: onCreatePoll },
  ];

  return (
    <div className="relative border-t border-border/70 bg-surface/90 backdrop-blur-xl" onPaste={handlePaste}>
      <div className="relative mx-auto w-full max-w-3xl px-2.5 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 sm:px-4 sm:pt-2.5">
        {/* Context strips */}
        <AnimatePresence initial={false}>
          {editingMessage && (
            <motion.div
              key="edit"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mb-2 flex items-center gap-2.5 rounded-xl bg-accent/10 px-3 py-2 text-sm">
                <Pencil className="h-4 w-4 shrink-0 text-accent" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-accent">تعديل الرسالة</p>
                  <p dir="auto" className="truncate text-xs text-muted-foreground">
                    {messagePreview(editingMessage)}
                  </p>
                </div>
                <button type="button" onClick={onCancelEdit} aria-label="إلغاء التعديل" className="rounded-full p-1 text-muted-foreground hover:bg-surface-2">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          )}

          {replyingTo && !editingMessage && (
            <motion.div
              key={`reply-${replyingTo._id}`}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mb-2 flex items-center gap-2.5 overflow-hidden rounded-xl bg-surface-2/80 text-sm">
                <span className="w-1 self-stretch bg-accent" />
                <Reply className="h-4 w-4 shrink-0 text-accent" />
                <div className="min-w-0 flex-1 py-2">
                  <p className="truncate text-xs font-semibold text-accent">{replyingTo.sender?.name ?? 'مستخدم محذوف'}</p>
                  <p dir="auto" className="truncate text-xs text-muted-foreground">
                    {messagePreview(replyingTo) || 'مرفق'}
                  </p>
                </div>
                {replyPreviewImage && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cldOptimize(assetUrl(replyPreviewImage.url) ?? '', { width: 96 })} alt="" className="h-11 w-11 rounded-lg object-cover" />
                )}
                <button type="button" onClick={onCancelReply} aria-label="إلغاء الرد" className="me-1.5 rounded-full p-1 text-muted-foreground hover:bg-surface">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          )}

          {smart && (
            <motion.div
              key="smart"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              className="mb-2 flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none"
            >
              <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-accent">
                <Sparkles className="h-3.5 w-3.5" />
              </span>
              {smart.status === 'loading'
                ? [64, 92, 76].map((w, i) => (
                    <span key={i} className="h-8 shrink-0 animate-pulse rounded-full bg-accent/10" style={{ width: w }} />
                  ))
                : smart.status === 'error'
                  ? <span className="shrink-0 text-xs text-danger">{smart.error}</span>
                  : smart.replies.length === 0
                    ? <span className="shrink-0 text-xs text-muted-foreground">لا توجد اقتراحات الآن</span>
                    : smart.replies.map((reply, i) => (
                        <motion.button
                          key={reply}
                          type="button"
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: i * 0.05 }}
                          onClick={() => {
                            editText(reply);
                            setSmart(null);
                            requestAnimationFrame(() => textareaRef.current?.focus());
                          }}
                          dir="auto"
                          className="shrink-0 rounded-full border border-accent/30 bg-accent/[0.07] px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-accent/15"
                        >
                          {reply}
                        </motion.button>
                      ))}
              <button
                type="button"
                onClick={() => setSmart(null)}
                aria-label="إخفاء الاقتراحات"
                className="ms-auto shrink-0 rounded-full p-1 text-muted-foreground hover:bg-surface-2"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Chips: armed modes, AI undo, scheduled queue */}
        {(armed.silent || armed.effect || armed.schedule || undoText !== null || scheduledCount > 0) && (
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            {armed.schedule && (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
                <CalendarClock className="h-3.5 w-3.5" /> ستختار وقت الإرسال
                <button type="button" aria-label="إلغاء" onClick={() => setArmed((a) => ({ ...a, schedule: false }))}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {armed.silent && (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
                <BellOff className="h-3.5 w-3.5" /> بدون صوت
                <button type="button" aria-label="إلغاء" onClick={() => setArmed((a) => ({ ...a, silent: false }))}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {armed.effect && (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
                {EFFECT_META[armed.effect].emoji} مع تأثير {EFFECT_META[armed.effect].label}
                <button type="button" aria-label="إلغاء" onClick={() => setArmed((a) => ({ ...a, effect: undefined }))}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {undoText !== null && (
              <button
                type="button"
                onClick={() => {
                  editText(undoText);
                  setUndoText(null);
                }}
                className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium text-foreground hover:bg-surface-3"
              >
                <Undo2 className="h-3.5 w-3.5" /> تراجع عن إعادة الصياغة
              </button>
            )}
            {scheduledCount > 0 && (
              <button
                type="button"
                onClick={onOpenScheduled}
                className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <CalendarClock className="h-3.5 w-3.5" />
                {scheduledCount === 1 ? 'رسالة مجدولة' : `${scheduledCount} رسائل مجدولة`}
              </button>
            )}
          </div>
        )}

        {/* Attachment tray */}
        {files.length > 0 && (
          <div className="mb-2 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {files.map((file, i) => (
              <motion.div
                key={`${file.name}-${file.lastModified}-${i}`}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                className="group/file relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-surface-2 ring-1 ring-border/70"
                title={`${file.name} · ${formatBytes(file.size)}`}
              >
                {file.type.startsWith('image/') && previewUrls[i] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewUrls[i]} alt={file.name} className="h-full w-full object-cover" />
                ) : file.type.startsWith('video/') && previewUrls[i] ? (
                  <>
                    <video src={previewUrls[i]} muted className="h-full w-full object-cover" />
                    <Film className="absolute bottom-1 start-1 h-3.5 w-3.5 text-white drop-shadow" />
                  </>
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 p-1">
                    <FileText className="h-5 w-5 text-accent" />
                    <span className="w-full truncate text-center text-[9px] text-muted-foreground">{file.name}</span>
                  </div>
                )}
                <button
                  type="button"
                  aria-label={`إزالة ${file.name}`}
                  disabled={uploading}
                  onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                  className="absolute end-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              </motion.div>
            ))}
            {files.length < MAX_FILES && !uploading && (
              <button
                type="button"
                onClick={() => mediaInputRef.current?.click()}
                aria-label="إضافة المزيد"
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-accent hover:text-accent"
              >
                <Plus className="h-5 w-5" />
              </button>
            )}
          </div>
        )}

        {progress && (
          <div className="mb-2 rounded-xl bg-surface-2/80 px-3 py-2">
            <div className="mb-1 flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span>{progress.label}</span>
              <span dir="ltr">{progress.pct}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface">
              <div className="h-full rounded-full bg-gradient-accent transition-[width] duration-200" style={{ width: `${progress.pct}%` }} />
            </div>
          </div>
        )}

        {/* Slash command palette */}
        <AnimatePresence>
          {slashResults.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="absolute inset-x-2.5 bottom-full z-40 mb-1 overflow-hidden rounded-2xl border border-border/70 bg-surface/95 shadow-elev-4 backdrop-blur-xl sm:inset-x-4"
              role="listbox"
              aria-label="الأوامر"
            >
              <p className="border-b border-border/60 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">الأوامر السريعة</p>
              <div className="max-h-60 overflow-y-auto py-1 scrollbar-thin">
                {slashResults.map((command, i) => (
                  <button
                    key={command.id}
                    type="button"
                    role="option"
                    aria-selected={i === slashIndex}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setSlashIndex(i)}
                    onClick={() => runCommand(command)}
                    className={cn(
                      'flex w-full items-center gap-3 px-3 py-2 text-start transition-colors',
                      i === slashIndex ? 'bg-accent/10' : 'hover:bg-surface-2',
                    )}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-base">{command.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-foreground">{command.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">{command.hint}</span>
                    </span>
                    <span dir="ltr" className="font-mono text-[11px] text-muted-foreground">
                      /{command.keys[0]}
                    </span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {recording ? (
          <VoiceRecorder
            onCancel={() => setRecording(false)}
            onError={(message) => {
              setRecording(false);
              showToast(message, 'error');
            }}
            onSend={async (file, seconds) => {
              setRecording(false);
              setUploading(true);
              setProgress({ label: 'جارٍ رفع الرسالة الصوتية…', pct: 0 });
              try {
                const uploaded = await api.upload<{ url: string; size: number; mimeType: string }>('/upload/audio', file, (pct) =>
                  setProgress({ label: 'جارٍ رفع الرسالة الصوتية…', pct: Math.round(pct) }),
                );
                await onSend({
                  text: '',
                  attachments: [{ url: uploaded.url, type: 'voice', size: uploaded.size, mimeType: uploaded.mimeType, duration: seconds }],
                });
                onCancelReply();
              } catch (err) {
                showToast(err instanceof ApiError ? err.message : 'تعذّر إرسال الرسالة الصوتية.', 'error');
              } finally {
                setUploading(false);
                setProgress(null);
              }
            }}
          />
        ) : (
          <div className="flex items-end gap-1.5 sm:gap-2">
            {/* Attach */}
            <div ref={attachWrapRef} className="relative">
              <button
                type="button"
                onClick={() => {
                  setAttachOpen((v) => !v);
                  setSendMenuOpen(false);
                  setAiMenuOpen(false);
                }}
                aria-label="إرفاق"
                aria-expanded={attachOpen}
                disabled={!!editingMessage}
                className={cn(
                  'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-surface-2 hover:text-accent active:scale-95 disabled:opacity-40',
                  attachOpen && 'bg-accent/10 text-accent',
                )}
              >
                <Plus className={cn('h-[22px] w-[22px] transition-transform duration-200', attachOpen && 'rotate-45')} />
              </button>
              <Popover open={attachOpen} className="start-0 w-[17rem]">
                <div className="grid grid-cols-4 gap-1 p-1">
                  {attachItems.map((item, i) => (
                    <motion.button
                      key={item.key}
                      type="button"
                      initial={{ opacity: 0, y: 12, scale: 0.7 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ delay: 0.04 * i, type: 'spring', stiffness: 600, damping: 26 }}
                      onClick={() => {
                        setAttachOpen(false);
                        item.run();
                      }}
                      className="flex flex-col items-center gap-1.5 rounded-xl p-2 transition-colors hover:bg-surface-2"
                    >
                      <span className={cn('flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br text-white shadow-elev-1', item.tone)}>
                        <item.icon className="h-5 w-5" />
                      </span>
                      <span className="text-[11px] font-medium text-foreground">{item.label}</span>
                    </motion.button>
                  ))}
                </div>
              </Popover>
            </div>

            {/* Input pill */}
            <div className="relative flex min-w-0 flex-1 items-end rounded-[1.4rem] bg-surface-2/80 ring-1 ring-border/60 transition-all focus-within:bg-surface focus-within:shadow-elev-1 focus-within:ring-2 focus-within:ring-accent/40">
              <div className="relative">
                <button
                  ref={emojiButtonRef}
                  type="button"
                  onClick={() => setEmojiOpen((v) => !v)}
                  aria-label="الرموز التعبيرية"
                  className="flex h-11 w-10 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-accent"
                >
                  <Smile className="h-[21px] w-[21px]" />
                </button>
                <EmojiPicker
                  open={emojiOpen}
                  onClose={() => setEmojiOpen(false)}
                  onSelect={(emoji) => editText((t) => t + emoji)}
                  triggerRef={emojiButtonRef}
                  anchorClassName="absolute bottom-full start-0 z-40 mb-3 w-72 rounded-2xl border border-border bg-surface p-3 shadow-elev-4 animate-scale-in"
                />
              </div>
              <MentionTextarea
                inputRef={textareaRef}
                rows={1}
                value={text}
                dir="auto"
                enterKeyHint="send"
                suggestionsPlacement="top"
                onChange={(e) => {
                  editText(e.target.value);
                  if (undoText !== null) setUndoText(null);
                  if (e.target.value) onTyping();
                }}
                onBlur={onStopTyping}
                onKeyDown={handleKeyDown}
                placeholder={editingMessage ? 'عدّل رسالتك' : 'اكتب رسالة… أو / للأوامر'}
                aria-label="نص الرسالة"
                className={cn(
                  'max-h-[168px] resize-none rounded-none border-0 bg-transparent px-0.5 py-[11px] text-base leading-6 shadow-none focus:border-0 focus:outline-none focus:ring-0 md:text-[15px]',
                  aiBusy && 'animate-pulse',
                )}
              />
              <div ref={aiWrapRef} className="relative">
                <button
                  type="button"
                  disabled={aiBusy}
                  onClick={() => {
                    if (!text.trim()) {
                      void suggestReplies();
                      return;
                    }
                    setAiMenuOpen((v) => !v);
                    setAttachOpen(false);
                    setSendMenuOpen(false);
                  }}
                  aria-label={text.trim() ? 'أدوات الكتابة بالذكاء الاصطناعي' : 'اقترح ردًا'}
                  title={text.trim() ? 'أدوات الكتابة بالذكاء الاصطناعي' : 'اقترح ردًا'}
                  className="flex h-11 w-10 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-accent disabled:opacity-60"
                >
                  {aiBusy ? <Loader2 className="h-[19px] w-[19px] animate-spin text-accent" /> : <Sparkles className="h-[19px] w-[19px]" />}
                </button>
                <Popover open={aiMenuOpen} className="end-0 w-56">
                  <p className="flex items-center gap-1.5 px-2.5 pb-1 pt-1.5 text-[11px] font-semibold text-accent">
                    <Wand2 className="h-3.5 w-3.5" /> الكتابة بالذكاء الاصطناعي
                  </p>
                  {REWRITE_MODES.map((m) => (
                    <button
                      key={m.mode}
                      type="button"
                      onClick={() => void rewrite(m.mode)}
                      className="flex h-10 w-full items-center rounded-xl px-2.5 text-start text-sm text-foreground transition-colors hover:bg-surface-2"
                    >
                      {m.label}
                    </button>
                  ))}
                </Popover>
              </div>
            </div>

            {/* Send / mic */}
            <div ref={sendWrapRef} className="group/send relative">
              {hasContent || editingMessage ? (
                <>
                  {!editingMessage && (
                    <button
                      type="button"
                      onClick={() => setSendMenuOpen((v) => !v)}
                      aria-label="خيارات الإرسال"
                      title="خيارات الإرسال"
                      className="absolute -top-7 left-1/2 hidden h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full bg-surface text-muted-foreground opacity-0 shadow-elev-1 ring-1 ring-border/70 transition-opacity hover:text-accent group-hover/send:opacity-100 md:flex"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <motion.button
                    key="send"
                    type="button"
                    initial={{ scale: 0.6, rotate: -30 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 600, damping: 22 }}
                    {...sendPressHandlers}
                    onClick={() => {
                      if (consumeLongPress()) return;
                      primarySend();
                    }}
                    disabled={uploading}
                    aria-label={editingMessage ? 'حفظ التعديل' : armed.schedule ? 'جدولة' : 'إرسال'}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-accent text-white shadow-elev-2 transition-transform hover:shadow-glow active:scale-90 disabled:opacity-60"
                  >
                    {uploading ? (
                      <Loader2 className="h-[18px] w-[18px] animate-spin" />
                    ) : editingMessage ? (
                      <Pencil className="h-[18px] w-[18px]" />
                    ) : armed.schedule ? (
                      <CalendarClock className="h-[18px] w-[18px]" />
                    ) : (
                      <Send className="h-[18px] w-[18px] rtl:-scale-x-100" />
                    )}
                  </motion.button>
                </>
              ) : (
                <motion.button
                  key="mic"
                  type="button"
                  initial={{ scale: 0.6 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 600, damping: 22 }}
                  onClick={() => {
                    closeMenus();
                    setRecording(true);
                  }}
                  disabled={uploading}
                  aria-label="تسجيل رسالة صوتية"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-accent text-white shadow-elev-2 transition-transform hover:shadow-glow active:scale-90 disabled:opacity-60"
                >
                  {uploading ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <Mic className="h-[19px] w-[19px]" />}
                </motion.button>
              )}

              <Popover open={sendMenuOpen} className="end-0 w-64">
                <button
                  type="button"
                  onClick={() => void send({ silent: true })}
                  className="flex h-11 w-full items-center gap-3 rounded-xl px-3 text-start text-sm text-foreground transition-colors hover:bg-surface-2"
                >
                  <BellOff className="h-4 w-4 text-muted-foreground" /> إرسال بدون صوت
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSendMenuOpen(false);
                    setScheduleOpen(true);
                  }}
                  className="flex h-11 w-full items-center gap-3 rounded-xl px-3 text-start text-sm text-foreground transition-colors hover:bg-surface-2"
                >
                  <CalendarClock className="h-4 w-4 text-muted-foreground" /> جدولة الإرسال
                </button>
                <p className="px-3 pb-1 pt-2 text-[11px] font-semibold text-muted-foreground">إرسال مع تأثير</p>
                <div className="grid grid-cols-4 gap-1 px-1 pb-1">
                  {EFFECTS.map((effect) => (
                    <button
                      key={effect}
                      type="button"
                      onClick={() => void send({ effect })}
                      className="flex flex-col items-center gap-0.5 rounded-xl py-2 transition-transform hover:scale-105 hover:bg-surface-2 active:scale-95"
                    >
                      <span className="text-2xl leading-none">{EFFECT_META[effect].emoji}</span>
                      <span className="text-[10px] text-muted-foreground">{EFFECT_META[effect].label}</span>
                    </button>
                  ))}
                </div>
              </Popover>
            </div>
          </div>
        )}
      </div>

      <input
        ref={mediaInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(e) => {
          addFiles(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          addFiles(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          addFiles(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />

      <ScheduleSendModal
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        preview={text.trim() ? messagePreview({ text }) : files.length ? `${files.length} مرفق` : undefined}
        onSchedule={async (when) => {
          await send({ scheduleAt: when.toISOString() });
        }}
      />
    </div>
  );
});
