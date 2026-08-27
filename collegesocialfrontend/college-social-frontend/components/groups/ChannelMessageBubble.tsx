import { FileText } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { ViewablePhoto } from '@/components/ui/ViewablePhoto';
import { assetUrl, cn, timeAgo } from '@/lib/utils';
import { cldOptimize } from '@/lib/images';
import type { ChannelMessage } from '@/lib/types';

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp)$/i;

export function ChannelMessageBubble({ message, isOwn, showAvatar }: { message: ChannelMessage; isOwn: boolean; showAvatar: boolean }) {
  const attachment = message.attachmentUrl ? assetUrl(message.attachmentUrl) : null;
  const isImage = attachment && IMAGE_EXTENSIONS.test(attachment);

  return (
    <div className={cn('flex items-end gap-2.5', isOwn && 'flex-row-reverse')}>
      <div className="w-8 shrink-0">
        {!isOwn && showAvatar && (
          <Avatar src={assetUrl(message.sender?.photoUrl)} name={message.sender?.name ?? 'مستخدم محذوف'} size="sm" viewable />
        )}
      </div>
      <div className={cn('flex max-w-[75%] flex-col gap-1', isOwn ? 'items-end' : 'items-start')}>
        {attachment && (
          <div className={cn('animate-bubble-in overflow-hidden rounded-2xl', isOwn ? 'rounded-bl-md' : 'rounded-br-md')}>
            {isImage ? (
              <ViewablePhoto src={cldOptimize(attachment, { width: 1600 })} alt="مرفق" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cldOptimize(attachment, { width: 1000 })} alt="مرفق" className="max-h-64 w-auto object-cover" />
              </ViewablePhoto>
            ) : (
              <a
                href={attachment}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'flex items-center gap-2 px-4 py-3 text-[15px] transition-colors',
                  isOwn ? 'bg-gradient-accent text-white' : 'bg-surface-2/70 text-foreground hover:bg-surface-2',
                )}
              >
                <FileText className="h-4 w-4 shrink-0" />
                مرفق
              </a>
            )}
          </div>
        )}
        {message.text && (
          <div
            className={cn(
              'animate-bubble-in whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed',
              isOwn ? 'rounded-bl-md bg-gradient-accent text-white shadow-soft' : 'rounded-br-md bg-surface-2/70 text-foreground',
            )}
          >
            {message.text}
          </div>
        )}
        <span className="px-1 text-xs text-muted-foreground">{timeAgo(message.createdAt)}</span>
      </div>
    </div>
  );
}
