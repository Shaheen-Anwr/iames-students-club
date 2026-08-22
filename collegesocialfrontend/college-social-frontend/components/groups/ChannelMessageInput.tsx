'use client';

import { useRef, useState } from 'react';
import { Paperclip, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { formatBytes } from '@/lib/utils';
import type { UploadResult } from '@/lib/types';

interface ChannelMessageInputProps {
  onSend: (text: string, attachmentUrl?: string) => void;
  onTyping: () => void;
}

export function ChannelMessageInput({ onSend, onTyping }: ChannelMessageInputProps) {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleSend() {
    if (!text.trim() && !file) return;

    let attachmentUrl: string | undefined;
    if (file) {
      setUploading(true);
      try {
        const uploaded = await api.upload<UploadResult>('/upload/file', file);
        attachmentUrl = uploaded.url;
      } catch (err) {
        showToast(err instanceof ApiError ? err.message : 'تعذّر إرفاق الملف.', 'error');
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    onSend(text.trim(), attachmentUrl);
    setText('');
    setFile(null);
  }

  return (
    <div className="border-t border-border bg-surface p-4">
      {file && (
        <div className="mb-3 flex items-center gap-3 rounded-xl2 bg-surface-2/70 px-3.5 py-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
            <Paperclip className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
            <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
          </div>
          <button
            onClick={() => setFile(null)}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface hover:text-danger"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-transform hover:scale-110 hover:bg-surface-2 hover:text-accent active:scale-95"
        >
          <Paperclip className="h-5 w-5" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <textarea
          rows={1}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            onTyping();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="اكتب رسالة"
          className="max-h-32 flex-1 resize-none rounded-2xl border border-transparent bg-surface-2/70 px-4 py-2.5 text-base leading-relaxed placeholder:text-muted-foreground transition-colors focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 md:text-[15px]"
        />
        <Button
          onClick={handleSend}
          disabled={uploading || (!text.trim() && !file)}
          size="icon"
          className="shrink-0 transition-transform active:scale-95"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
