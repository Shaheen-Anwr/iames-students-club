import { PostDetail } from '@/components/feed/PostDetail';

export default function PostPage({ params }: { params: { id: string } }) {
  return <PostDetail postId={params.id} />;
}
