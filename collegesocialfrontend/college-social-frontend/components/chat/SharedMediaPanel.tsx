'use client';

import { useEffect, useState } from 'react';
import { FileText, Link2, PlayCircle } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { Tabs } from '@/components/ui/Tabs';
import { Lightbox } from '@/components/feed/Lightbox';
import { api } from '@/lib/api';
import { assetUrl, cn, formatBytes, timeAgo } from '@/lib/utils';
import type { SharedMedia } from '@/lib/types';
import { LinkPreviewCard } from './LinkPreviewCard';

const TABS = [
  { id: 'media', label: 'الوسائط' },
  { id: 'files', label: 'الملفات' },
  { id: 'links', label: 'الروابط' },
];

export function SharedMediaPanel({
  open,
  onClose,
  conversationId,
}: {
  open: boolean;
  onClose: () => void;
  conversationId: string;
}) {
  const [tab, setTab] = useState('media');
  const [data, setData] = useState<SharedMedia | null>(null);
  const [loading, setLoading] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api
      .get<SharedMedia>(`/chat/conversations/${conversationId}/media`)
      .then(setData)
      .finally(() => setLoading(false));
  }, [open, conversationId]);

  const images = (data?.media ?? []).filter((m) => m.type === 'image').map((m) => assetUrl(m.url)!);

  return (
    <>
      <Modal open={open} onClose={onClose} title="الوسائط والملفات والروابط" className="max-w-lg">
        <div className="-mx-5 -mt-1">
          <Tabs tabs={TABS} active={tab} onChange={setTab} className="px-5" />
        </div>
        <div className="pt-4">
          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <Spinner className="h-6 w-6" />
            </div>
          ) : !data ? null : tab === 'media' ? (
            data.media.length === 0 ? (
              <EmptyState label="لا توجد وسائط بعد" />
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {data.media.map((item, i) => {
                  const url = assetUrl(item.url)!;
                  if (item.type === 'video') {
                    return (
                      <a
                        key={`${item._id}-${i}`}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="relative flex aspect-square items-center justify-center rounded-lg bg-surface-2 text-muted-foreground"
                      >
                        <video src={url} className="h-full w-full rounded-lg object-cover opacity-70" />
                        <PlayCircle className="absolute h-7 w-7 text-white drop-shadow" />
                      </a>
                    );
                  }
                  const imgIndex = images.indexOf(url);
                  return (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={`${item._id}-${i}`}
                      src={url}
                      alt=""
                      onClick={() => imgIndex >= 0 && setLightboxIndex(imgIndex)}
                      className="aspect-square cursor-pointer rounded-lg object-cover transition-opacity hover:opacity-90"
                    />
                  );
                })}
              </div>
            )
          ) : tab === 'files' ? (
            data.files.length === 0 ? (
              <EmptyState label="لا توجد ملفات بعد" />
            ) : (
              <div className="space-y-1.5">
                {data.files.map((file, i) => (
                  <a
                    key={`${file._id}-${i}`}
                    href={assetUrl(file.url)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2.5 rounded-xl2 bg-surface-2/60 px-3 py-2.5 hover:bg-surface-2"
                  >
                    <FileText className="h-5 w-5 shrink-0 text-accent" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{file.name ?? 'مرفق'}</p>
                      <p className="text-xs text-muted-foreground">
                        {file.size != null ? formatBytes(file.size) : ''} · {timeAgo(file.createdAt)}
                      </p>
                    </div>
                  </a>
                ))}
              </div>
            )
          ) : data.links.length === 0 ? (
            <EmptyState label="لا توجد روابط بعد" />
          ) : (
            <div className="space-y-2">
              {data.links.map((link, i) => (
                <LinkPreviewCard key={`${link.messageId}-${i}`} url={link.url} isOwn={false} />
              ))}
            </div>
          )}
        </div>
      </Modal>
      {lightboxIndex !== null && (
        <Lightbox images={images} index={lightboxIndex} onIndexChange={setLightboxIndex} onClose={() => setLightboxIndex(null)} />
      )}
    </>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <Link2 className={cn('h-6 w-6 text-muted-foreground')} />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
