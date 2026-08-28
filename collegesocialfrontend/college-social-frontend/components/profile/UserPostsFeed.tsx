'use client';

import { useEffect, useState } from 'react';
import { Inbox } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
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
      <div className="rounded-xl2 border border-dashed border-border">
        <EmptyState icon={Inbox} title="لا توجد منشورات لعرضها" />
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
