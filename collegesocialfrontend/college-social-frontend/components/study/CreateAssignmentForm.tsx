'use client';

import { useRef, useState } from 'react';
import { FileText, Film, Paperclip, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { formatBytes } from '@/lib/utils';
import type { Assignment, PostAttachmentType } from '@/lib/types';

const ATTACHMENT_OPTIONS: { type: Exclude<PostAttachmentType, 'none'>; label: string; icon: typeof FileText; accept: string }[] = [
  { type: 'lecture', label: 'ملف الواجب', icon: FileText, accept: '.pdf,.ppt,.pptx,.doc,.docx,.txt' },
  { type: 'video', label: 'فيديو', icon: Film, accept: 'video/*' },
  { type: 'file', label: 'ملف آخر', icon: Paperclip, accept: '*' },
];

export function CreateAssignmentForm({
  groupId,
  isMilitary = false,
  onCreated,
  onClose,
}: {
  groupId?: string;
  // When true, this is a التربية العسكرية assignment: no course-code field (the backend
  // labels it), always global to every student.
  isMilitary?: boolean;
  onCreated: (assignment: Assignment) => void;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('23:59');
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

    const courseCodeRequired = !groupId && !isMilitary;
    if (!title.trim() || !date || (courseCodeRequired && !courseCode.trim())) {
      showToast(courseCodeRequired ? 'العنوان ورمز المقرر وتاريخ التسليم مطلوبة.' : 'العنوان وتاريخ التسليم مطلوبان.', 'error');
      return;
    }

    const finalTime = time.trim() || '23:59';
    const parsedDate = new Date(`${date}T${finalTime}`);

    if (isNaN(parsedDate.getTime())) {
      showToast('يرجى تحديد تاريخ ووقت التسليم بشكل صحيح.', 'error');
      return;
    }

    setSubmitting(true);

    try {
      let attachmentUrl: string | undefined;
      let attachmentOriginalName: string | undefined;

      // 1. File Upload Processing
      if (file && pendingType) {
        const uploadEndpoint = `/upload/${pendingType}`;
        const rawUploaded = await api.upload<any>(uploadEndpoint, file);

        const data = rawUploaded?.data ?? rawUploaded;
        attachmentUrl = data?.url || data?.secure_url || data?.fileUrl || data?.path || data?.location || data?.link;
        attachmentOriginalName = file.name;

        if (!attachmentUrl) {
          throw new Error('فشل رفع الملف: لم يتم استلام رابط الملف من السيرفر.');
        }
      }

      // 2. Assignment Request Payload Generation
      const payload: Record<string, any> = {
        title: title.trim(),
        dueDate: parsedDate.toISOString(),
        attachmentType: file && pendingType && attachmentUrl ? pendingType : 'none',
      };

      if (description.trim()) payload.description = description.trim();
      if (courseCode.trim()) payload.courseCode = courseCode.trim();
      if (isMilitary) payload.isMilitary = true;
      if (attachmentUrl) payload.attachmentUrl = attachmentUrl;
      if (attachmentOriginalName) payload.attachmentOriginalName = attachmentOriginalName;

      const endpoint = groupId ? `/assignments/group/${groupId}` : '/assignments';
      const rawResult = await api.post<Assignment | { data: Assignment }>(endpoint, payload);

      const createdAssignment = (rawResult as { data?: Assignment })?.data ?? (rawResult as Assignment);

      if (createdAssignment && createdAssignment._id) {
        onCreated(createdAssignment);
        showToast('تم إنشاء الواجب.');
        onClose();
      } else {
        throw new Error('تعذّر الحصول على بيانات الواجب المُنشأ.');
      }
    } catch (err: any) {
      console.error('Assignment Submission Error:', err);

      let message = 'تعذّر إنشاء الواجب.';

      if (err instanceof ApiError && err.message) {
        message = Array.isArray(err.message) ? err.message.join(' | ') : String(err.message);
      } else if (err?.response?.data?.message) {
        const msg = err.response.data.message;
        message = Array.isArray(msg) ? msg.join(' | ') : String(msg);
      } else if (typeof err?.message === 'string') {
        message = err.message;
      }

      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <Input label="عنوان الواجب" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: تسليم مشروع الفصل" required />

      <Textarea rows={3} placeholder="تفاصيل الواجب (اختياري)" value={description} onChange={(e) => setDescription(e.target.value)} />

      {!isMilitary && (
        <Input
          label={groupId ? 'رمز المقرر (اختياري)' : 'رمز المقرر'}
          value={courseCode}
          onChange={(e) => setCourseCode(e.target.value)}
          placeholder="مثال: CS101"
          required={!groupId}
        />
      )}

      <div className="grid grid-cols-2 gap-3">
        <Input label="تاريخ التسليم" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        <Input label="وقت التسليم" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
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