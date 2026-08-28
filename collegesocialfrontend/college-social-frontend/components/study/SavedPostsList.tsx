'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bookmark } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { PostCard } from '@/components/feed/PostCard';
import { api } from '@/lib/api';
import type { Post } from '@/lib/types';

const PAGE_SIZE = 10;

export function SavedPostsList() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    api
      .get<Post[]>(`/posts/saved?page=1&limit=${PAGE_SIZE}`)
      .then((data) => {
        setPosts(data);
        setHasMore(data.length === PAGE_SIZE);
      })
      .finally(() => setLoading(false));
  }, []);

  async function loadMore() {
    setLoadingMore(true);
    const nextPage = page + 1;
    const data = await api.get<Post[]>(`/posts/saved?page=${nextPage}&limit=${PAGE_SIZE}`);
    setPosts((prev) => [...prev, ...data]);
    setPage(nextPage);
    setHasMore(data.length === PAGE_SIZE);
    setLoadingMore(false);
  }

  function handleDeleted(id: string) {
    setPosts((prev) => prev.filter((p) => p._id !== id));
  }

  function handleSavedChange(id: string, saved: boolean) {
    if (!saved) setPosts((prev) => prev.filter((p) => p._id !== id));
  }

  return (
    <div className="space-y-4">
      {loading ? (
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
          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button variant="outline" size="sm" loading={loadingMore} onClick={loadMore}>
                عرض المزيد
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
