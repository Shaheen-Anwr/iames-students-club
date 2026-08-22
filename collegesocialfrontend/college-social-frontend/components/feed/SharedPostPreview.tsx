import Link from 'next/link';
import { Avatar } from '@/components/ui/Avatar';
import { RoleBadge } from '@/components/ui/Badge';
import { assetUrl, timeAgo } from '@/lib/utils';
import type { Post } from '@/lib/types';
import { TaggedText } from '@/components/shared/TaggedText';
import { AttachmentPreview } from './AttachmentPreview';

// Read-only embed of the original post inside a share -- no reactions/comments/save bar of its
// own, matching Facebook's nested share preview.
export function SharedPostPreview({ post }: { post: Post }) {
  return (
    <div className="mt-3 overflow-hidden rounded-xl2 border border-border">
      <div className="p-3.5">
        <div className="flex items-center justify-between gap-3">
          {post.author ? (
            <Link href={`/profile/${post.author._id}`} className="flex items-center gap-2.5">
              <Avatar src={assetUrl(post.author.photoUrl)} name={post.author.name} size="sm" />
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-semibold text-foreground hover:underline">{post.author.name}</p>
                  <RoleBadge role={post.author.role} />
                </div>
                <p className="text-xs text-muted-foreground">{timeAgo(post.createdAt)}</p>
              </div>
            </Link>
          ) : (
            <div className="flex items-center gap-2.5">
              <Avatar src={undefined} name="؟" size="sm" />
              <div>
                <p className="text-sm font-semibold text-muted-foreground">مستخدم محذوف</p>
                <p className="text-xs text-muted-foreground">{timeAgo(post.createdAt)}</p>
              </div>
            </div>
          )}
        </div>

        {post.caption && (
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            <TaggedText text={post.caption} />
          </p>
        )}
      </div>

      {post.attachmentType !== 'none' && (
        <AttachmentPreview
          attachmentType={post.attachmentType}
          attachmentUrl={post.attachmentUrl}
          attachmentOriginalName={post.attachmentOriginalName}
          images={post.images}
        />
      )}
    </div>
  );
}
