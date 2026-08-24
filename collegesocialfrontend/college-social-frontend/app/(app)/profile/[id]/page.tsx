'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { MessageCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { AboutCard } from '@/components/profile/AboutCard';
import { FriendActionButton } from '@/components/profile/FriendActionButton';
import { ProfileFriendsTab } from '@/components/profile/ProfileFriendsTab';
import { UserPostsFeed } from '@/components/profile/UserPostsFeed';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import type { ProfileTab } from '@/components/profile/ProfileTabs';
import type { Conversation, User } from '@/lib/types';

export default function UserProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user: currentUser } = useAuth();
  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [messaging, setMessaging] = useState(false);
  const [tab, setTab] = useState<ProfileTab>('posts');

  useEffect(() => {
    setLoading(true);
    api
      .get<User>(`/users/${params.id}`)
      .then(setProfile)
      .finally(() => setLoading(false));
  }, [params.id]);

  async function handleMessage() {
    if (!profile) return;
    setMessaging(true);
    try {
      const conversation = await api.post<Conversation>('/chat/conversations', { participantIds: [profile._id] });
      router.push(`/chat/${conversation._id}`);
    } finally {
      setMessaging(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (!profile) {
    return <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">لم يتم العثور على المستخدم.</div>;
  }

  const isOwn = currentUser?._id === profile._id;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
      <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-6">
        <ProfileHeader
          user={profile}
          isOwn={isOwn}
          onPhotoUploaded={isOwn ? (photoUrl) => setProfile((p) => (p ? { ...p, photoUrl } : p)) : undefined}
          onCoverPhotoUploaded={isOwn ? (coverPhotoUrl) => setProfile((p) => (p ? { ...p, coverPhotoUrl } : p)) : undefined}
          tab={tab}
          onTabChange={setTab}
        />
        {!isOwn && (
          <div className="flex gap-2">
            <Button onClick={handleMessage} loading={messaging} size="lg" className="flex-1">
              <MessageCircle className="h-4 w-4" />
              مراسلة
            </Button>
            <FriendActionButton targetUser={profile} size="lg" className="flex-1" />
          </div>
        )}
        {tab === 'posts' && <UserPostsFeed userId={profile._id} />}
        {tab === 'about' && <AboutCard user={profile} />}
        {tab === 'friends' && <ProfileFriendsTab profileId={profile._id} isOwn={isOwn} />}
      </div>
    </div>
  );
}
