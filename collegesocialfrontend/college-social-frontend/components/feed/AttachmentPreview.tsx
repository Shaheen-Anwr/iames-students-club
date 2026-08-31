'use client';

import { useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Download, FileText, Loader2, Paperclip, Play } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { useAttachmentObjectUrl } from '@/lib/use-attachment';
import { viaCdn } from '@/lib/media';
import { assetUrl, formatBytes } from '@/lib/utils';
import type { Post, PostAttachmentType } from '@/lib/types';
import { ImageGallery } from './ImageGallery';

const ATTACHMENT_TYPE_LABELS: Record<PostAttachmentType, string> = {
  lecture: 'محاضرة',
  video: 'فيديو',
  file: 'ملف',
  image: 'صورة',
  none: '',
};

const DOCUMENT_COLORS: Record<'lecture' | 'file', { text: string; bg: string }> = {
  lecture: { text: 'text-sky-500', bg: 'bg-sky-500/15' },
  file: { text: 'text-slate-400', bg: 'bg-slate-400/15' },
};

type AttachmentPreviewProps = Pick<
  Post,
  'attachmentType' | 'attachmentUrl' | 'attachmentOriginalName' | 'attachmentSize' | 'attachmentChunkCount' | 'images'
> & {
  // Required to open a chunked 'lecture'/'file' attachment (attachmentChunkCount > 1), which has to
  // be reassembled by the backend. Not needed for 'image'/'video'/'none' or an unsplit attachment.
  postId?: string;
};

export function isPdf(url: string, name?: string | null) {
  return url.toLowerCase().endsWith('.pdf') || (name ?? '').toLowerCase().endsWith('.pdf');
}

// Click-to-play, like Facebook -- avoids every video in a long feed loading/decoding at once,
// and doesn't fight the native controls once playback starts.
function VideoPlayer({ url }: { url: string }) {
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  return (
    <div className="relative overflow-hidden rounded-xl2 bg-black">
      <video
        ref={videoRef}
        controls
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        className="max-h-[32rem] w-full"
      >
        <source src={viaCdn(url) ?? url} />
      </video>
      {!playing && (
        <button
          type="button"
          onClick={() => videoRef.current?.play()}
          className="absolute inset-0 flex items-center justify-center bg-black/10 transition-colors hover:bg-black/25"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/95 text-foreground shadow-card transition-transform hover:scale-110">
            <Play className="h-7 w-7 fill-current ps-1" />
          </span>
        </button>
      )}
    </div>
  );
}

export function AttachmentPreview({
  attachmentType,
  attachmentUrl,
  attachmentOriginalName,
  attachmentSize,
  attachmentChunkCount,
  images,
  postId,
}: AttachmentPreviewProps) {
  if (attachmentType === 'none') return null;

  if (attachmentType === 'image') {
    if (!images?.length) return null;
    return <ImageGallery images={images.map((url) => assetUrl(url)!)} />;
  }

  if (!attachmentUrl) return null;

  if (attachmentType === 'video') {
    // Always a complete, directly playable Cloudinary URL even when the source video was too large
    // for one asset and got split -- see the backend's StorageService.upload() splice path. No
    // proxy needed.
    return <VideoPlayer url={assetUrl(attachmentUrl)!} />;
  }

  return (
    <DocumentAttachment
      attachmentType={attachmentType}
      attachmentUrl={attachmentUrl}
      attachmentOriginalName={attachmentOriginalName}
      attachmentSize={attachmentSize}
      attachmentChunkCount={attachmentChunkCount}
      postId={postId}
    />
  );
}

// An unsplit 'lecture'/'file' attachment is linked straight at its Cloudinary URL -- the backend
// only 302-redirects there anyway. A *chunked* one (attachmentChunkCount > 1) has to be reassembled
// by the backend, so it's fetched on demand via useAttachmentObjectUrl() (authenticated,
// refresh-on-401) rather than baking a soon-to-expire access token into an <a>/<iframe>, so
// download/preview keep working no matter how long the feed has been open.
function DocumentAttachment({
  attachmentType,
  attachmentUrl,
  attachmentOriginalName,
  attachmentSize,
  attachmentChunkCount,
  postId,
}: {
  attachmentType: 'lecture' | 'file';
  attachmentUrl: string;
  attachmentOriginalName?: string | null;
  attachmentSize?: number | null;
  attachmentChunkCount?: number | null;
  postId?: string;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const isChunked = (attachmentChunkCount ?? 1) > 1;
  const { url, loading, error, load, download } = useAttachmentObjectUrl(isChunked ? postId : undefined);

  // Only a chunked attachment with a known postId needs the backend-reassembled blob; everything
  // else points straight at the Cloudinary asset (no token, nothing to expire).
  const directUrl = isChunked && postId ? null : assetUrl(attachmentUrl);

  const Icon = attachmentType === 'lecture' ? FileText : Paperclip;
  const colors = DOCUMENT_COLORS[attachmentType];
  const pdfPreviewable = attachmentType === 'lecture' && isPdf(attachmentUrl, attachmentOriginalName);

  function handleDownload() {
    if (directUrl) {
      window.open(directUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    void download(attachmentOriginalName);
  }

  function handleTogglePreview() {
    setPreviewOpen((open) => {
      const next = !open;
      if (next && !directUrl) void load();
      return next;
    });
  }

  const previewSrc = directUrl ?? url ?? undefined;

  return (
    <div className="space-y-2 overflow-hidden rounded-xl2 border border-border">
      <div className="flex items-center gap-3.5 bg-surface-2/70 p-3.5">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${colors.bg} ${colors.text}`}>
          <Icon className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{attachmentOriginalName ?? 'مرفق'}</p>
          <div className="mt-1 flex items-center gap-1.5">
            <Badge className={`${colors.bg} ${colors.text}`}>{ATTACHMENT_TYPE_LABELS[attachmentType]}</Badge>
            {!!attachmentSize && <span className="text-xs text-muted-foreground">{formatBytes(attachmentSize)}</span>}
            {error && <span className="text-xs text-red-500">تعذّر فتح المرفق</span>}
          </div>
        </div>
        {pdfPreviewable && (
          <button
            type="button"
            onClick={handleTogglePreview}
            className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-accent hover:bg-accent/10"
          >
            {previewOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            معاينة
          </button>
        )}
        <button
          type="button"
          onClick={handleDownload}
          disabled={loading}
          title="تنزيل"
          className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-surface hover:text-foreground disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        </button>
      </div>
      {pdfPreviewable && previewOpen && (
        previewSrc ? (
          <iframe
            src={previewSrc}
            className="h-96 w-full border-t border-border"
            title={attachmentOriginalName ?? 'معاينة PDF'}
          />
        ) : (
          <div className="flex h-96 w-full items-center justify-center border-t border-border text-sm text-muted-foreground">
            {error ? 'تعذّر تحميل المعاينة' : <Loader2 className="h-5 w-5 animate-spin" />}
          </div>
        )
      )}
    </div>
  );
}
