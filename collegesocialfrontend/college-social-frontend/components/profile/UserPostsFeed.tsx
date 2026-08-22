'use client';

import { useEffect, useState } from 'react';
import { Inbox } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { api } from '@/lib/api';
import type { Post } from '@/lib/types';
import { PostCard } from '@/components/feed/PostCard';

export function UserPostsFeed({ userId }: { userId: string }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<Post[]>(`/posts?author=${userId}&limit=30`)
      .then((data) => {
        if (!cancelled) setPosts(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  function handleDeleted(id: string) {
    setPosts((prev) => prev.filter((p) => p._id !== id));
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl2 border border-dashed border-border py-16 text-center text-muted-foreground">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2/70">
          <Inbox className="h-5 w-5" />
        </div>
        <p className="text-sm">لا توجد منشورات لعرضها.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {posts.map((post) => (
        <PostCard key={post._id} post={post} onDeleted={handleDeleted} />
      ))}
    </div>
  );
}
