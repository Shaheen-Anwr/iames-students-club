'use client';

import { useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Download, FileText, Paperclip, Play } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { postAttachmentUrl } from '@/lib/api';
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

type AttachmentPreviewProps = Pick<Post, 'attachmentType' | 'attachmentUrl' | 'attachmentOriginalName' | 'attachmentSize' | 'images'> & {
  // Required for 'lecture'/'file' -- see postAttachmentUrl(). Not needed for 'image'/'video'/'none'.
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
        <source src={url} />
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

export function AttachmentPreview({ attachmentType, attachmentUrl, attachmentOriginalName, attachmentSize, images, postId }: AttachmentPreviewProps) {
  const [previewOpen, setPreviewOpen] = useState(false);

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

  // 'lecture'/'file' go through the backend instead of attachmentUrl directly -- it transparently
  // reassembles an attachment that was too large for one Cloudinary asset (see postAttachmentUrl()),
  // and just redirects straight to Cloudinary for a normal, unsplit one.
  const url = postId ? postAttachmentUrl(postId) : assetUrl(attachmentUrl)!;

  const Icon = attachmentType === 'lecture' ? FileText : Paperclip;
  const colors = DOCUMENT_COLORS[attachmentType];
  const pdfPreviewable = attachmentType === 'lecture' && isPdf(attachmentUrl, attachmentOriginalName);

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
          </div>
        </div>
        {pdfPreviewable && (
          <button
            type="button"
            onClick={() => setPreviewOpen((o) => !o)}
            className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-accent hover:bg-accent/10"
          >
            {previewOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            معاينة
          </button>
        )}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          title="تنزيل"
          className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-surface hover:text-foreground"
        >
          <Download className="h-4 w-4" />
        </a>
      </div>
      {pdfPreviewable && previewOpen && (
        <iframe src={url} className="h-96 w-full border-t border-border" title={attachmentOriginalName ?? 'معاينة PDF'} />
      )}
    </div>
  );
}
