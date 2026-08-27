'use client';

import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useAttachmentObjectUrl } from '@/lib/use-attachment';
import { assetUrl } from '@/lib/utils';

export function LecturePdfLightbox({
  open,
  onClose,
  postId,
  attachmentUrl,
  attachmentChunkCount,
  title,
}: {
  open: boolean;
  onClose: () => void;
  postId: string;
  attachmentUrl: string;
  attachmentChunkCount?: number | null;
  title: string;
}) {
  // An unsplit PDF is just its Cloudinary URL. A chunked one has to be reassembled by the backend,
  // so fetch it through the authenticated refresh-on-401 path (see useAttachmentObjectUrl) rather
  // than an <iframe src> carrying a pre-baked, soon-to-expire access token.
  const isChunked = (attachmentChunkCount ?? 1) > 1;
  const directUrl = isChunked ? null : assetUrl(attachmentUrl);
  const { url, error, load } = useAttachmentObjectUrl(isChunked ? postId : undefined);

  useEffect(() => {
    if (open && isChunked) void load();
  }, [open, isChunked, load]);

  const src = directUrl ?? url ?? undefined;

  return (
    <Modal open={open} onClose={onClose} title={title} className="h-[85vh] max-w-4xl">
      {src ? (
        <iframe
          src={src}
          title={title}
          className="h-full max-h-[calc(85vh-4rem)] w-full rounded-xl border border-border"
        />
      ) : (
        <div className="flex h-full max-h-[calc(85vh-4rem)] w-full items-center justify-center rounded-xl border border-border text-sm text-muted-foreground">
          {error ? 'تعذّر تحميل المعاينة' : <Loader2 className="h-6 w-6 animate-spin" />}
        </div>
      )}
    </Modal>
  );
}
