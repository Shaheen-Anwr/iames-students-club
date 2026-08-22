'use client';

import { useRef, useState } from 'react';
import { Check, RotateCcw, Upload } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { CHAT_BACKGROUND_PRESETS, chatBackgroundStyle, type ChatBackground } from '@/lib/chat-background';
import type { UploadResult } from '@/lib/types';

interface ChatBackgroundModalProps {
  open: boolean;
  onClose: () => void;
  background: ChatBackground | null;
  onChange: (bg: ChatBackground | null) => void;
}

export function ChatBackgroundModal({ open, onClose, background, onChange }: ChatBackgroundModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();
  const [uploading, setUploading] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const result = await api.upload<UploadResult>('/upload/chat-background', file);
      onChange({ type: 'custom', value: result.url });
      showToast('تم تعيين خلفية المحادثة.');
      onClose();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر رفع الصورة.', 'error');
    } finally {
      setUploading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="خلفية المحادثة">
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">خلفيات جاهزة للمذاكرة</p>
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => {
                onChange(null);
                onClose();
              }}
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl2 border-2 border-dashed border-border bg-surface-2 text-muted-foreground transition-colors hover:border-accent"
            >
              {!background && <Check className="h-4 w-4 text-accent" />}
              <span className="text-[11px]">الافتراضية</span>
            </button>
            {CHAT_BACKGROUND_PRESETS.map((preset) => {
              const selected = background?.type === 'preset' && background.value === preset.id;
              return (
                <button
                  key={preset.id}
                  onClick={() => {
                    onChange({ type: 'preset', value: preset.id });
                    onClose();
                  }}
                  className="relative flex aspect-square items-end overflow-hidden rounded-xl2 border-2 border-border transition-colors hover:border-accent"
                  style={chatBackgroundStyle({ type: 'preset', value: preset.id })}
                >
                  {selected && (
                    <span className="absolute end-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-white">
                      <Check className="h-3 w-3" />
                    </span>
                  )}
                  <span className="w-full truncate bg-black/40 px-1.5 py-1 text-[11px] text-white">{preset.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-border pt-4">
          <Button variant="secondary" className="flex-1" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? <Spinner className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
            رفع صورة من جهازك
          </Button>
          {background && (
            <Button
              variant="ghost"
              onClick={() => {
                onChange(null);
                onClose();
              }}
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          )}
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
      </div>
    </Modal>
  );
}
