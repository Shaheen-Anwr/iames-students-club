'use client';

import Link from 'next/link';
import { Bookmark } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { PostCard } from '@/components/feed/PostCard';
import { useInfiniteApiList } from '@/lib/query';
import type { Post } from '@/lib/types';

const PAGE_SIZE = 10;
const QUERY_KEY = ['posts', 'saved'];

export function SavedPostsList() {
  const qc = useQueryClient();
  const { items: posts, isPending, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useInfiniteApiList<Post>('/posts/saved', { key: QUERY_KEY, pageSize: PAGE_SIZE });

  // Unsaving / deleting a post drops it from every cached page immediately.
  function removeFromCache(id: string) {
    qc.setQueryData<{ pages: Post[][]; pageParams: unknown[] }>(QUERY_KEY, (old) =>
      old ? { ...old, pages: old.pages.map((pg) => pg.filter((p) => p._id !== id)) } : old,
    );
  }

  function handleDeleted(id: string) {
    removeFromCache(id);
  }

  function handleSavedChange(id: string, saved: boolean) {
    if (!saved) removeFromCache(id);
  }

  return (
    <div className="space-y-4">
      {isPending ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-6 w-6" />
        </div>
      ) : posts.length === 0 ? (
        <div className="rounded-xl2 border border-dashed border-border bg-surface-2/40">
          <EmptyState
            icon={Bookmark}
            title="لم تحفظ أي منشورات بعد"
            description="اضغط على أيقونة الحفظ في أي منشور لإضافته هنا."
            action={
              <Link href="/feed">
                <Button size="sm" variant="outline">
                  تصفح المنشورات
                </Button>
              </Link>
            }
          />
        </div>
      ) : (
        <>
          {posts.map((post) => (
            <PostCard key={post._id} post={post} onDeleted={handleDeleted} onSavedChange={handleSavedChange} />
          ))}
          {hasNextPage && (
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                size="sm"
                loading={isFetchingNextPage}
                onClick={() => fetchNextPage()}
              >
                عرض المزيد
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
