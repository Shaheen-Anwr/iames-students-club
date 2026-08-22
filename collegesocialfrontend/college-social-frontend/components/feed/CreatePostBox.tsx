'use client';

import { useEffect, useRef, useState } from 'react';
import { FileText, Film, Image as ImageIcon, Paperclip, X } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { MentionTextarea } from '@/components/shared/MentionTextarea';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { DEPARTMENT_LABELS } from '@/lib/departments';
import { ACADEMIC_YEAR_LABELS, getAcademicYearsForDepartment, type AcademicYear } from '@/lib/academic-years';
import { SPECIALIZATIONS_BY_DEPARTMENT, SPECIALIZATION_LABELS, type Specialization } from '@/lib/specializations';
import { assetUrl, cn, formatBytes } from '@/lib/utils';
import type { Post, PostAttachmentType, PostScope, UploadResult } from '@/lib/types';

const TAG_SELECT_CLASS =
  'h-7 rounded-full border border-border bg-surface-2/70 px-2.5 text-xs font-medium text-muted-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20';

const ATTACHMENT_OPTIONS: { type: Exclude<PostAttachmentType, 'none' | 'image'>; label: string; icon: typeof FileText; accept: string }[] = [
  { type: 'lecture', label: 'محاضرة', icon: FileText, accept: '.pdf,.ppt,.pptx,.doc,.docx,.txt' },
  { type: 'video', label: 'فيديو', icon: Film, accept: 'video/*' },
  { type: 'file', label: 'ملف', icon: Paperclip, accept: '*' },
];

const MAX_IMAGES = 10;
const IMAGE_ACCEPT = 'image/jpeg,image/jpg,image/png,image/webp,image/gif';

export function CreatePostBox({
  onCreated,
  defaultScope = 'public',
}: {
  onCreated: (post: Post) => void;
  defaultScope?: PostScope;
}) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [caption, setCaption] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [showCourseInput, setShowCourseInput] = useState(false);
  const [pendingType, setPendingType] = useState<Exclude<PostAttachmentType, 'none' | 'image'> | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [images, setImages] = useState<{ file: File; previewUrl: string }[]>([]);
  const [scope, setScope] = useState<PostScope>(defaultScope);
  const [academicYear, setAcademicYear] = useState<AcademicYear | ''>(user?.academicYear ?? '');
  const [specialization, setSpecialization] = useState<Specialization | ''>(user?.specialization ?? '');
  const [submitting, setSubmitting] = useState(false);

  const academicYearOptions = user?.department ? getAcademicYearsForDepartment(user.department) : [];
  const specializationOptions = user?.department ? SPECIALIZATIONS_BY_DEPARTMENT[user.department] : [];

  useEffect(() => {
    setScope(defaultScope);
  }, [defaultScope]);

  function pickFile(type: Exclude<PostAttachmentType, 'none' | 'image'>) {
    clearImages();
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

  function pickImages() {
    clearAttachment();
    requestAnimationFrame(() => imageInputRef.current?.click());
  }

  function handleImagesChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!selected.length) return;
    setImages((prev) => {
      const room = MAX_IMAGES - prev.length;
      if (room <= 0) {
        showToast(`يمكنك إرفاق ${MAX_IMAGES} صور كحد أقصى.`, 'error');
        return prev;
      }
      return [...prev, ...selected.slice(0, room).map((file) => ({ file, previewUrl: URL.createObjectURL(file) }))];
    });
  }

  function removeImage(index: number) {
    setImages((prev) => {
      URL.revokeObjectURL(prev[index].previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }

  function clearImages() {
    setImages((prev) => {
      for (const img of prev) URL.revokeObjectURL(img.previewUrl);
      return [];
    });
  }

  useEffect(() => {
    return () => {
      for (const img of images) URL.revokeObjectURL(img.previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit() {
    if (!caption.trim() && !file && images.length === 0) {
      showToast('اكتب شيئًا أو أرفق ملفًا أولًا.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      let attachmentUrl: string | undefined;
      let attachmentOriginalName: string | undefined;
      let attachmentSize: number | undefined;
      let attachmentType: PostAttachmentType = 'none';
      let uploadedImages: string[] | undefined;

      if (images.length > 0) {
        const { images: urls } = await api.uploadMany<{ images: string[] }>(
          '/upload/post-images',
          images.map((img) => img.file),
        );
        uploadedImages = urls;
        attachmentType = 'image';
      } else if (file && pendingType) {
        const uploaded = await api.upload<UploadResult>(`/upload/${pendingType}`, file);
        attachmentUrl = uploaded.url;
        attachmentOriginalName = file.name;
        attachmentSize = uploaded.size;
        attachmentType = pendingType;
      }

      const post = await api.post<Post>('/posts', {
        caption: caption.trim(),
        attachmentType,
        attachmentUrl,
        attachmentOriginalName,
        attachmentSize,
        images: uploadedImages,
        courseCode: courseCode.trim() || undefined,
        scope,
        academicYear: academicYear || undefined,
        specialization: specialization || undefined,
      });

      onCreated(post);
      setCaption('');
      setCourseCode('');
      setShowCourseInput(false);
      clearAttachment();
      clearImages();
      showToast(scope === 'department' ? 'تم النشر في صفحة الشعبة.' : 'تم النشر في الصفحة العامة.');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر إنشاء المنشور.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  if (!user) return null;

  return (
    <Card className="p-5 transition-shadow focus-within:shadow-card">
      <div className="flex gap-3.5">
        <Avatar src={assetUrl(user.photoUrl)} name={user.name} size="md" />
        <div className="min-w-0 flex-1 space-y-3.5">
          <MentionTextarea
            rows={2}
            placeholder={`شارك ملاحظاتك أو سؤالك أو تحديثًا، يا ${user.name.split(' ')[0]}... (استخدم @ للإشارة إلى أحد، و# لإضافة وسم)`}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            className="rounded-xl2 border-transparent bg-surface-2/70 px-4 py-3 text-[15px] leading-relaxed focus:bg-surface"
          />

          {showCourseInput || courseCode ? (
            <div className="flex max-w-[14rem] items-center gap-2">
              <Input
                autoFocus
                placeholder="رمز المقرر، مثل CS101"
                value={courseCode}
                onChange={(e) => setCourseCode(e.target.value)}
                className="h-9 rounded-full border-transparent bg-surface-2/70 text-xs"
              />
              {!courseCode && (
                <button
                  type="button"
                  onClick={() => setShowCourseInput(false)}
                  className="shrink-0 text-xs text-muted-foreground hover:text-accent"
                >
                  إلغاء
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowCourseInput(true)}
              className="text-xs font-medium text-muted-foreground transition-colors hover:text-accent"
            >
              + إضافة رمز المقرر
            </button>
          )}

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
                onClick={clearAttachment}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface hover:text-danger"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {images.length > 0 && (
            <div className="grid grid-cols-4 gap-2">
              {images.map((img, i) => (
                <div key={img.previewUrl} className="group relative aspect-square overflow-hidden rounded-xl2 bg-surface-2">
                  <img src={img.previewUrl} alt="" className="h-full w-full object-cover" />
                  <button
                    onClick={() => removeImage(i)}
                    className="absolute end-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white transition-opacity hover:bg-black/80"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3.5">
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={pickImages}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-2 hover:text-accent"
              >
                <ImageIcon className="h-4 w-4" />
                صورة
              </button>
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
            <div className="flex flex-wrap items-center gap-2.5">
              {user.department && (
                <>
                  <div className="flex gap-1 rounded-full bg-surface-2 p-0.5">
                    <button
                      type="button"
                      onClick={() => setScope('department')}
                      className={cn(
                        'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                        scope === 'department' ? 'bg-gradient-accent text-white shadow-glow' : 'text-muted-foreground',
                      )}
                    >
                      {DEPARTMENT_LABELS[user.department]}
                    </button>
                    <button
                      type="button"
                      onClick={() => setScope('public')}
                      className={cn(
                        'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                        scope === 'public' ? 'bg-gradient-accent text-white shadow-glow' : 'text-muted-foreground',
                      )}
                    >
                      عام
                    </button>
                  </div>
                  <select
                    value={academicYear}
                    onChange={(e) => setAcademicYear(e.target.value as AcademicYear | '')}
                    className={TAG_SELECT_CLASS}
                  >
                    <option value="">السنة الدراسية</option>
                    {academicYearOptions.map((y) => (
                      <option key={y} value={y}>
                        {ACADEMIC_YEAR_LABELS[y]}
                      </option>
                    ))}
                  </select>
                  <select
                    value={specialization}
                    onChange={(e) => setSpecialization(e.target.value as Specialization | '')}
                    className={TAG_SELECT_CLASS}
                  >
                    <option value="">التخصص</option>
                    {specializationOptions.map((s) => (
                      <option key={s} value={s}>
                        {SPECIALIZATION_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </>
              )}
              <Button onClick={handleSubmit} loading={submitting} size="md" className="rounded-full px-5">
                نشر
              </Button>
            </div>
          </div>
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept={ATTACHMENT_OPTIONS.find((o) => o.type === pendingType)?.accept}
        onChange={handleFileChange}
      />
      <input ref={imageInputRef} type="file" multiple accept={IMAGE_ACCEPT} className="hidden" onChange={handleImagesChange} />
    </Card>
  );
}
