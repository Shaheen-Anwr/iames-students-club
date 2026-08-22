'use client';

import { useRef, useState } from 'react';
import { FileText, Film, Paperclip, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { formatBytes } from '@/lib/utils';
import type { Assignment, PostAttachmentType, UploadResult } from '@/lib/types';

const ATTACHMENT_OPTIONS: { type: Exclude<PostAttachmentType, 'none'>; label: string; icon: typeof FileText; accept: string }[] = [
  { type: 'lecture', label: 'ملف الواجب', icon: FileText, accept: '.pdf,.ppt,.pptx,.doc,.docx,.txt' },
  { type: 'video', label: 'فيديو', icon: Film, accept: 'video/*' },
  { type: 'file', label: 'ملف آخر', icon: Paperclip, accept: '*' },
];

export function CreateAssignmentForm({ onCreated, onClose }: { onCreated: (assignment: Assignment) => void; onClose: () => void }) {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [pendingType, setPendingType] = useState<Exclude<PostAttachmentType, 'none'> | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function pickFile(type: Exclude<PostAttachmentType, 'none'>) {
    setPendingType(type);
    requestAnimationFrame(() => fileInputRef.current?.click());
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (selected) setFile(selected);
    e.target.value = '';
  }

  function clearAttachment() {
    setFile(null);
    setPendingType(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !courseCode.trim() || !dueDate) {
      showToast('العنوان ورمز المقرر وتاريخ التسليم مطلوبة.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      let attachmentUrl: string | undefined;
      let attachmentOriginalName: string | undefined;

      if (file && pendingType) {
        const uploaded = await api.upload<UploadResult>(`/upload/${pendingType}`, file);
        attachmentUrl = uploaded.url;
        attachmentOriginalName = file.name;
      }

      const assignment = await api.post<Assignment>('/assignments', {
        title: title.trim(),
        description: description.trim() || undefined,
        courseCode: courseCode.trim(),
        dueDate: new Date(dueDate).toISOString(),
        attachmentType: file && pendingType ? pendingType : 'none',
        attachmentUrl,
        attachmentOriginalName,
      });

      onCreated(assignment);
      showToast('تم إنشاء الواجب.');
      onClose();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر إنشاء الواجب.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input label="عنوان الواجب" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: تسليم مشروع الفصل" required />

      <Textarea rows={3} placeholder="تفاصيل الواجب (اختياري)" value={description} onChange={(e) => setDescription(e.target.value)} />

      <div className="grid grid-cols-2 gap-3">
        <Input label="رمز المقرر" value={courseCode} onChange={(e) => setCourseCode(e.target.value)} placeholder="مثال: CS101" required />
        <Input label="تاريخ ووقت التسليم" type="datetime-local" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
      </div>

      {file && (
        <div className="flex items-center gap-3 rounded-xl2 bg-surface-2/70 px-3.5 py-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
            {pendingType === 'video' ? (
              <Film className="h-4 w-4" />
            ) : pendingType === 'lecture' ? (
              <FileText className="h-4 w-4" />
            ) : (
              <Paperclip className="h-4 w-4" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
            <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
          </div>
          <button
            type="button"
            onClick={clearAttachment}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface hover:text-danger"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-1">
        {ATTACHMENT_OPTIONS.map(({ type, label, icon: Icon }) => (
          <button
            key={type}
            type="button"
            onClick={() => pickFile(type)}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-2 hover:text-accent"
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      <Button type="submit" loading={submitting} className="w-full">
        إنشاء الواجب
      </Button>

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept={ATTACHMENT_OPTIONS.find((o) => o.type === pendingType)?.accept}
        onChange={handleFileChange}
      />
    </form>
  );
}
