'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { api, ApiError } from '@/lib/api';
import type { Post } from '@/lib/types';
import { PostCard } from './PostCard';

// Single-post permalink view (route: /posts/[id]). Opened from post/comment/reaction/share
// notifications so they land on the exact post instead of the top of the feed. `?comments=1`
// (set for "commented on your post" / "replied to your comment" notifications) auto-opens the
// comments modal.
export function PostDetail({ postId }: { postId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const openComments = searchParams.get('comments') === '1';

  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get<Post>(`/posts/${postId}`)
      .then((data) => {
        if (!cancelled) setPost(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError && err.status === 404 ? 'هذا المنشور لم يعد متاحًا.' : 'تعذّر تحميل المنشور.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [postId]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <button
        onClick={() => router.push('/feed')}
        className="mb-4 flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowRight className="h-4 w-4" />
        العودة إلى المنشورات
      </button>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-6 w-6" />
        </div>
      ) : error || !post ? (
        <p className="py-12 text-center text-sm text-muted-foreground">{error ?? 'هذا المنشور لم يعد متاحًا.'}</p>
      ) : (
        <PostCard post={post} onDeleted={() => router.push('/feed')} initialCommentsOpen={openComments} />
      )}
    </div>
  );
}
