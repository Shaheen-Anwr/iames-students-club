'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, Paperclip, Pencil, Reply, Send, Smile, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { MentionTextarea } from '@/components/shared/MentionTextarea';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { formatBytes } from '@/lib/utils';
import type { Attachment, AttachmentType, Message } from '@/lib/types';
import { EmojiPicker } from './EmojiPicker';

interface MessageInputProps {
  onSend: (text: string, attachments?: Attachment[], replyTo?: string) => void;
  onTyping: () => void;
  onStopTyping: () => void;
  replyingTo?: Message | null;
  onCancelReply: () => void;
  editingMessage?: Message | null;
  onCancelEdit: () => void;
  onSubmitEdit: (messageId: string, text: string) => void;
}

function categoryForMime(mimeType: string): { category: 'photos' | 'videos' | 'audio' | 'files'; type: AttachmentType } {
  if (mimeType.startsWith('image/')) return { category: 'photos', type: 'image' };
  if (mimeType.startsWith('video/')) return { category: 'videos', type: 'video' };
  if (mimeType.startsWith('audio/')) return { category: 'audio', type: 'audio' };
  return { category: 'files', type: 'document' };
}

export function MessageInput({
  onSend,
  onTyping,
  onStopTyping,
  replyingTo,
  onCancelReply,
  editingMessage,
  onCancelEdit,
  onSubmitEdit,
}: MessageInputProps) {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(editingMessage?.text ?? '');
  useEffect(() => {
    setText(editingMessage?.text ?? '');
  }, [editingMessage]);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);

  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  async function uploadFile(file: File): Promise<Attachment> {
    const { category, type } = categoryForMime(file.type);
    const uploaded = await api.upload<{ url: string; size: number; mimeType: string; originalName?: string }>(
      `/upload/${category === 'photos' ? 'photo' : category === 'videos' ? 'video' : category === 'audio' ? 'audio' : 'file'}`,
      file,
    );
    return { url: uploaded.url, type, name: file.name, size: uploaded.size, mimeType: uploaded.mimeType };
  }

  async function handleSend() {
    if (editingMessage) {
      if (!text.trim()) return;
      onSubmitEdit(editingMessage._id, text.trim());
      setText('');
      return;
    }

    if (!text.trim() && files.length === 0) return;

    let attachments: Attachment[] | undefined;
    if (files.length) {
      setUploading(true);
      try {
        attachments = await Promise.all(files.map(uploadFile));
      } catch (err) {
        showToast(err instanceof ApiError ? err.message : 'تعذّر إرفاق الملف.', 'error');
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    onSend(text.trim(), attachments, replyingTo?._id);
    setText('');
    setFiles([]);
    onCancelReply();
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list)]);
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      recordedChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
        if (blob.size > 0) {
          setUploading(true);
          try {
            const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });
            const uploaded = await api.upload<{ url: string; size: number; mimeType: string }>('/upload/audio', file);
            const attachment: Attachment = {
              url: uploaded.url,
              type: 'voice',
              size: uploaded.size,
              mimeType: uploaded.mimeType,
              duration: recordSeconds,
            };
            onSend('', [attachment], replyingTo?._id);
            onCancelReply();
          } catch (err) {
            showToast(err instanceof ApiError ? err.message : 'تعذّر إرسال الرسالة الصوتية.', 'error');
          } finally {
            setUploading(false);
          }
        }
        setRecordSeconds(0);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
      setRecordSeconds(0);
      recordTimerRef.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    } catch {
      showToast('تعذّر الوصول إلى الميكروفون.', 'error');
    }
  }

  function stopRecording(send: boolean) {
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    setRecording(false);
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    if (!send) {
      // Discard: detach the handler before stopping so onstop doesn't fire the upload/send flow.
      recorder.onstop = () => streamRef.current?.getTracks().forEach((t) => t.stop());
      recordedChunksRef.current = [];
    }
    recorder.stop();
  }

  const formattedRecordTime = `${Math.floor(recordSeconds / 60)}:${(recordSeconds % 60).toString().padStart(2, '0')}`;

  return (
    <div className="border-t border-border bg-surface p-4">
      {editingMessage && (
        <div className="mb-3 flex items-center gap-2.5 rounded-xl2 bg-accent/10 px-3.5 py-2 text-sm">
          <Pencil className="h-4 w-4 shrink-0 text-accent" />
          <span className="min-w-0 flex-1 truncate text-foreground">تعديل الرسالة</span>
          <button onClick={onCancelEdit} className="rounded-full p-1 text-muted-foreground hover:bg-surface-2">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {replyingTo && !editingMessage && (
        <div className="mb-3 flex items-center gap-2.5 rounded-xl2 border-s-4 border-accent bg-surface-2/70 px-3.5 py-2 text-sm">
          <Reply className="h-4 w-4 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-foreground">{replyingTo.sender?.name ?? 'مستخدم محذوف'}</p>
            <p className="truncate text-xs text-muted-foreground">{replyingTo.text || 'مرفق'}</p>
          </div>
          <button onClick={onCancelReply} className="rounded-full p-1 text-muted-foreground hover:bg-surface-2">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {files.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {files.map((file, i) => (
            <div key={i} className="flex items-center gap-2.5 rounded-xl2 bg-surface-2/70 px-3.5 py-2">
              <Paperclip className="h-4 w-4 shrink-0 text-accent" />
              <div className="min-w-0">
                <p className="max-w-[10rem] truncate text-sm font-medium text-foreground">{file.name}</p>
                <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
              </div>
              <button onClick={() => removeFile(i)} className="rounded-full p-1 text-muted-foreground hover:bg-surface hover:text-danger">
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {recording ? (
        <div className="flex items-center gap-3 rounded-2xl bg-danger/10 px-4 py-2.5">
          <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-danger" />
          <span className="flex-1 text-sm font-medium text-foreground">جارٍ التسجيل… {formattedRecordTime}</span>
          <button
            onClick={() => stopRecording(false)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-2 hover:text-danger"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <button
            onClick={() => stopRecording(true)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-accent text-white shadow-soft"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="flex items-end gap-2">
          <div className="relative">
            <button
              onClick={() => setEmojiOpen((v) => !v)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-transform hover:scale-110 hover:bg-surface-2 hover:text-accent active:scale-95"
            >
              <Smile className="h-5 w-5" />
            </button>
            <EmojiPicker
              open={emojiOpen}
              onClose={() => setEmojiOpen(false)}
              onSelect={(emoji) => setText((t) => t + emoji)}
              anchorClassName="absolute bottom-full start-0 z-30 mb-2 w-72 rounded-2xl border border-border bg-surface p-3 shadow-card animate-slide-up"
            />
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-transform hover:scale-110 hover:bg-surface-2 hover:text-accent active:scale-95"
          >
            <Paperclip className="h-5 w-5" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <MentionTextarea
            rows={1}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              onTyping();
            }}
            onBlur={onStopTyping}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
              if (e.key === 'Escape' && editingMessage) onCancelEdit();
            }}
            placeholder="اكتب رسالة"
            className="max-h-32 flex-1 resize-none rounded-2xl border border-transparent bg-surface-2/70 px-4 py-2.5 text-base leading-relaxed placeholder:text-muted-foreground transition-colors focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 md:text-[15px]"
          />
          {!editingMessage && !text.trim() && files.length === 0 ? (
            <button
              onClick={startRecording}
              disabled={uploading}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-accent text-white shadow-soft transition-transform hover:shadow-glow active:scale-95"
            >
              <Mic className="h-4 w-4" />
            </button>
          ) : (
            <Button
              onClick={handleSend}
              disabled={uploading || (!text.trim() && files.length === 0)}
              loading={uploading}
              size="icon"
              className="shrink-0 transition-transform active:scale-95"
            >
              {editingMessage ? <Pencil className="h-4 w-4" /> : <Send className="h-4 w-4" />}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

