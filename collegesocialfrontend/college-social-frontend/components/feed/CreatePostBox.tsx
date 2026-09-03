'use client';

import { useEffect, useRef, useState } from 'react';
import {
  CalendarDays,
  ChevronDown,
  FileText,
  Film,
  Globe2,
  GraduationCap,
  Hash,
  Image as ImageIcon,
  ImagePlus,
  Lock,
  Paperclip,
  Users,
  X,
} from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { MentionTextarea } from '@/components/shared/MentionTextarea';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { DEPARTMENT_LABELS } from '@/lib/departments';
import { ACADEMIC_YEAR_LABELS, getAcademicYearsForDepartment, type AcademicYear } from '@/lib/academic-years';
import { SPECIALIZATIONS_BY_DEPARTMENT, SPECIALIZATION_LABELS, type Specialization } from '@/lib/specializations';
import { assetUrl, cn, formatBytes } from '@/lib/utils';
import type { Post, PostAttachmentType, PostScope, UploadResult } from '@/lib/types';

// Confirmation copy per audience, shown once the post lands.
const SCOPE_TOAST: Record<PostScope, string> = {
  department: 'تم النشر في صفحة الشعبة.',
  public: 'تم النشر في الصفحة العامة.',
  friends: 'تم النشر للأصحاب.',
  private: 'تم النشر لك فقط.',
};

// Labels for the audience dropdown. 'department' is filled in per-user (the department's own name).
const SCOPE_LABEL: Record<Exclude<PostScope, 'department'>, string> = {
  public: 'عام',
  friends: 'الأصحاب',
  private: 'أنا فقط',
};

// Leading glyph for the audience pill so the current reach is readable at a glance.
const SCOPE_ICON: Record<PostScope, typeof Globe2> = {
  department: Users,
  public: Globe2,
  friends: Users,
  private: Lock,
};

const ATTACHMENT_OPTIONS: { type: Exclude<PostAttachmentType, 'none' | 'image'>; label: string; icon: typeof FileText; accept: string }[] = [
  { type: 'lecture', label: 'محاضرة', icon: FileText, accept: '.pdf,.ppt,.pptx,.doc,.docx,.txt' },
  { type: 'video', label: 'فيديو', icon: Film, accept: 'video/*' },
  { type: 'file', label: 'ملف', icon: Paperclip, accept: '*' },
];

const MAX_IMAGES = 10;
const IMAGE_ACCEPT = 'image/jpeg,image/jpg,image/png,image/webp,image/gif';

// A styled wrapper around a native <select> -- keeps the OS picker (good on mobile) but gives it
// a leading icon, a chevron and the same pill look as the rest of the composer chrome.
function MetaSelect({
  icon: Icon,
  value,
  onChange,
  ariaLabel,
  children,
}: {
  icon: typeof Globe2;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative inline-flex items-center">
      <Icon className="pointer-events-none absolute start-2.5 h-3.5 w-3.5 text-muted-foreground" />
      <ChevronDown className="pointer-events-none absolute end-2 h-3 w-3 text-muted-foreground" />
      <select
        value={value}
        onChange={onChange}
        aria-label={ariaLabel}
        className="h-8 appearance-none rounded-full border border-border bg-surface-2/70 ps-7 pe-6 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-2 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
      >
        {children}
      </select>
    </div>
  );
}

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
  const dragDepth = useRef(0);

  const [open, setOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
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
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);

  const academicYearOptions = user?.department ? getAcademicYearsForDepartment(user.department) : [];
  const specializationOptions = user?.department ? SPECIALIZATIONS_BY_DEPARTMENT[user.department] : [];

  // Anything the user has already put in keeps the composer open regardless of focus.
  const hasContent = !!caption.trim() || !!file || images.length > 0 || showCourseInput || !!courseCode;
  const expanded = open || hasContent || dragActive;
  const canPost = !!caption.trim() || !!file || images.length > 0;

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

  // Shared entry point for images arriving from the file picker, a drag-drop or a clipboard paste.
  function addImageFiles(selected: File[]) {
    const imageFiles = selected.filter((f) => f.type.startsWith('image/'));
    if (!imageFiles.length) return;
    setImages((prev) => {
      const room = MAX_IMAGES - prev.length;
      if (room <= 0) {
        showToast(`يمكنك إرفاق ${MAX_IMAGES} صور كحد أقصى.`, 'error');
        return prev;
      }
      if (imageFiles.length > room) {
        showToast(`تمت إضافة ${room} صور فقط، والحد الأقصى ${MAX_IMAGES}.`, 'error');
      }
      return [...prev, ...imageFiles.slice(0, room).map((f) => ({ file: f, previewUrl: URL.createObjectURL(f) }))];
    });
  }

  function handleImagesChange(e: React.ChangeEvent<HTMLInputElement>) {
    addImageFiles(Array.from(e.target.files ?? []));
    e.target.value = '';
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

  // --- Drag & drop of image files onto the composer ---------------------------------------
  function isFileDrag(e: React.DragEvent) {
    return Array.from(e.dataTransfer.types).includes('Files');
  }

  function handleDragEnter(e: React.DragEvent) {
    if (submitting || !isFileDrag(e)) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragActive(true);
  }

  function handleDragOver(e: React.DragEvent) {
    if (isFileDrag(e)) e.preventDefault();
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!isFileDrag(e)) return;
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setDragActive(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    dragDepth.current = 0;
    setDragActive(false);
    if (submitting) return;
    const dropped = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
    if (!dropped.length) return;
    e.preventDefault();
    clearAttachment();
    setOpen(true);
    addImageFiles(dropped);
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const pasted = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'));
    if (!pasted.length) return;
    e.preventDefault();
    clearAttachment();
    addImageFiles(pasted);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  }

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
      let attachmentChunkCount: number | undefined;
      let attachmentType: PostAttachmentType = 'none';
      let uploadedImages: string[] | undefined;

      if (images.length > 0) {
        setUploadPercent(0);
        const { images: urls } = await api.uploadMany<{ images: string[] }>(
          '/upload/post-images',
          images.map((img) => img.file),
          setUploadPercent,
        );
        uploadedImages = urls;
        attachmentType = 'image';
      } else if (file && pendingType) {
        setUploadPercent(0);
        const uploaded = await api.upload<UploadResult>(`/upload/${pendingType}`, file, setUploadPercent);
        attachmentUrl = uploaded.url;
        attachmentOriginalName = file.name;
        attachmentSize = uploaded.size;
        attachmentChunkCount = uploaded.chunkCount;
        attachmentType = pendingType;
      }

      const post = await api.post<Post>('/posts', {
        caption: caption.trim(),
        attachmentType,
        attachmentUrl,
        attachmentOriginalName,
        attachmentSize,
        attachmentChunkCount,
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
      setOpen(false);
      showToast(SCOPE_TOAST[scope]);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر إنشاء المنشور.', 'error');
    } finally {
      setSubmitting(false);
      setUploadPercent(null);
    }
  }

  if (!user) return null;

  const firstName = user.name.split(' ')[0];
  const ScopeIcon = SCOPE_ICON[scope];

  return (
    <Card
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        'relative transition-[padding,box-shadow] duration-200 ease-standard',
        expanded
          ? 'p-4 focus-within:border-accent/25 focus-within:shadow-elev-3 focus-within:ring-1 focus-within:ring-inset focus-within:ring-accent/20 sm:p-5'
          : 'p-3 sm:p-3.5',
      )}
    >
      {dragActive && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed border-accent bg-accent/[0.06] backdrop-blur-[2px]">
          <div className="flex items-center gap-2 rounded-full bg-surface px-4 py-2 text-sm font-medium text-accent shadow-elev-2">
            <ImagePlus className="h-4 w-4" />
            أفلت الصور هنا
          </div>
        </div>
      )}

      {!expanded ? (
        /* Collapsed: one tap-target that opens the composer, plus quick shortcuts to the pickers. */
        <div className="flex items-center gap-3">
          <Avatar src={assetUrl(user.photoUrl)} name={user.name} size="md" />
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="h-11 flex-1 truncate rounded-full bg-surface-2/60 px-4 text-start text-sm text-muted-foreground ring-1 ring-inset ring-transparent transition-colors hover:bg-surface-2 hover:ring-border/60"
          >
            {`شارك ملاحظة أو سؤالاً، يا ${firstName}…`}
          </button>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => {
                setOpen(true);
                pickImages();
              }}
              title="صورة"
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-accent"
            >
              <ImageIcon className="h-[18px] w-[18px]" />
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(true);
                pickFile('lecture');
              }}
              title="محاضرة"
              className="hidden h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-accent min-[380px]:flex"
            >
              <FileText className="h-[18px] w-[18px]" />
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(true);
                pickFile('video');
              }}
              title="فيديو"
              className="hidden h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-accent sm:flex"
            >
              <Film className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>
      ) : (
        <div
          className="flex gap-3.5"
          onBlur={(e) => {
            // Collapse only when focus truly leaves the composer and nothing has been entered.
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setTimeout(() => setOpen(false), 100);
            }
          }}
        >
          <Avatar src={assetUrl(user.photoUrl)} name={user.name} size="md" className="hidden sm:block" />
          <div className="min-w-0 flex-1 space-y-3.5">
            <MentionTextarea
              autoFocus
              rows={3}
              placeholder={`شارك ملاحظاتك أو سؤالك أو تحديثًا، يا ${firstName}... (استخدم @ للإشارة إلى أحد، و# لإضافة وسم)`}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              className="rounded-xl2 border-transparent bg-surface-2/60 px-4 py-3 text-[15px] leading-relaxed ring-1 ring-inset ring-transparent transition-colors focus:bg-surface focus:ring-accent/25"
            />

            {showCourseInput || courseCode ? (
              <div className="flex max-w-[15rem] items-center gap-2">
                <Input
                  autoFocus
                  placeholder="رمز المقرر، مثل CS101"
                  value={courseCode}
                  onChange={(e) => setCourseCode(e.target.value)}
                  leading={<Hash className="h-3.5 w-3.5" />}
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
                className="inline-flex items-center gap-1.5 rounded-full bg-surface-2/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-2 hover:text-accent"
              >
                <Hash className="h-3.5 w-3.5" />
                إضافة رمز المقرر
              </button>
            )}

            {file && (
              <div className="flex items-center gap-3 rounded-xl2 bg-surface-2/70 px-3.5 py-2.5 ring-1 ring-inset ring-border/50">
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
                {!submitting && (
                  <button
                    onClick={clearAttachment}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface hover:text-danger"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}

            {images.length > 0 && (
              <div className="space-y-1.5">
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {images.map((img, i) => (
                    <div key={img.previewUrl} className="group relative aspect-square overflow-hidden rounded-xl2 bg-surface-2 ring-1 ring-inset ring-border/50">
                      <img src={img.previewUrl} alt="" className="h-full w-full object-cover" />
                      {!submitting && (
                        <button
                          onClick={() => removeImage(i)}
                          className="absolute end-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity hover:bg-black/80 group-hover:opacity-100 focus-visible:opacity-100"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  {images.length < MAX_IMAGES && !submitting && (
                    <button
                      type="button"
                      onClick={pickImages}
                      className="flex aspect-square items-center justify-center rounded-xl2 border border-dashed border-border text-muted-foreground transition-colors hover:border-accent/50 hover:bg-accent/5 hover:text-accent"
                    >
                      <ImagePlus className="h-5 w-5" />
                    </button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {images.length} من {MAX_IMAGES} صور
                </p>
              </div>
            )}

            {uploadPercent !== null && (
              <div className="flex flex-col gap-1.5">
                <ProgressBar percent={uploadPercent} />
                <span className="text-center text-xs text-muted-foreground">
                  {uploadPercent === 0
                    ? 'جاري تجهيز الصور…'
                    : uploadPercent < 100
                      ? `جاري الرفع… ${uploadPercent}%`
                      : 'جاري النشر…'}
                </span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-3 border-t border-border/70 pt-3.5">
              <div className="flex flex-wrap items-center gap-0.5">
                <button
                  type="button"
                  onClick={pickImages}
                  disabled={submitting}
                  className="group flex items-center gap-2 rounded-full px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-surface-2 transition-colors group-hover:bg-accent/10 group-hover:text-accent">
                    <ImageIcon className="h-3.5 w-3.5" />
                  </span>
                  <span className="hidden sm:inline">صورة</span>
                </button>
                {ATTACHMENT_OPTIONS.map(({ type, label, icon: Icon }) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => pickFile(type)}
                    disabled={submitting}
                    className="group flex items-center gap-2 rounded-full px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-surface-2 transition-colors group-hover:bg-accent/10 group-hover:text-accent">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="hidden sm:inline">{label}</span>
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {/* Audience selector -- who gets to see this post. Always shown; the department
                    option only exists for a user who has a department. */}
                <MetaSelect
                  icon={ScopeIcon}
                  value={scope}
                  onChange={(e) => setScope(e.target.value as PostScope)}
                  ariaLabel="من يمكنه رؤية هذا المنشور"
                >
                  {user.department && <option value="department">{DEPARTMENT_LABELS[user.department]}</option>}
                  <option value="public">{SCOPE_LABEL.public}</option>
                  <option value="friends">{SCOPE_LABEL.friends}</option>
                  <option value="private">{SCOPE_LABEL.private}</option>
                </MetaSelect>
                {user.department && (
                  <>
                    <MetaSelect
                      icon={CalendarDays}
                      value={academicYear}
                      onChange={(e) => setAcademicYear(e.target.value as AcademicYear | '')}
                      ariaLabel="السنة الدراسية"
                    >
                      <option value="">السنة الدراسية</option>
                      {academicYearOptions.map((y) => (
                        <option key={y} value={y}>
                          {ACADEMIC_YEAR_LABELS[y]}
                        </option>
                      ))}
                    </MetaSelect>
                    <MetaSelect
                      icon={GraduationCap}
                      value={specialization}
                      onChange={(e) => setSpecialization(e.target.value as Specialization | '')}
                      ariaLabel="التخصص"
                    >
                      <option value="">التخصص</option>
                      {specializationOptions.map((s) => (
                        <option key={s} value={s}>
                          {SPECIALIZATION_LABELS[s]}
                        </option>
                      ))}
                    </MetaSelect>
                  </>
                )}
                <Button
                  onClick={handleSubmit}
                  loading={submitting}
                  disabled={!canPost}
                  size="md"
                  className="rounded-full px-5"
                >
                  نشر
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
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
