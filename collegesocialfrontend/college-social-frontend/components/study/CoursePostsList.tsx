'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { PostCard } from '@/components/feed/PostCard';
import { api } from '@/lib/api';
import type { Post } from '@/lib/types';

const PAGE_SIZE = 10;

export function CoursePostsList({ courseCode }: { courseCode: string }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const query = `courseCode=${encodeURIComponent(courseCode)}&hasAttachment=true`;

  useEffect(() => {
    setLoading(true);
    api
      .get<Post[]>(`/posts?${query}&page=1&limit=${PAGE_SIZE}`)
      .then((data) => {
        setPosts(data);
        setHasMore(data.length === PAGE_SIZE);
        setPage(1);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseCode]);

  async function loadMore() {
    setLoadingMore(true);
    const nextPage = page + 1;
    const data = await api.get<Post[]>(`/posts?${query}&page=${nextPage}&limit=${PAGE_SIZE}`);
    setPosts((prev) => [...prev, ...data]);
    setPage(nextPage);
    setHasMore(data.length === PAGE_SIZE);
    setLoadingMore(false);
  }

  function handleDeleted(id: string) {
    setPosts((prev) => prev.filter((p) => p._id !== id));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link
          href="/study/courses"
          className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-surface-2"
        >
          <ArrowRight className="h-4 w-4" />
        </Link>
        <h1 className="text-lg font-semibold text-foreground">{courseCode}</h1>
        {!loading && (
          <span className="flex items-center gap-1 rounded-full bg-surface-2/70 px-2 py-0.5 text-xs text-muted-foreground">
            <Paperclip className="h-3 w-3" />
            {posts.length} مرفق
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-6 w-6" />
        </div>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl2 border border-dashed border-border bg-surface-2/40 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/10 text-accent">
            <Paperclip className="h-7 w-7" />
          </div>
          <p className="text-sm text-muted-foreground">لا توجد مرفقات لهذا المقرر بعد.</p>
        </div>
      ) : (
        <>
          {posts.map((post) => (
            <PostCard key={post._id} post={post} onDeleted={handleDeleted} />
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
