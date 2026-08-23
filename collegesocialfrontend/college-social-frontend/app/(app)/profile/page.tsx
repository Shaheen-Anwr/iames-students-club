'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { EditProfileForm } from '@/components/profile/EditProfileForm';
import { ChangePasswordForm } from '@/components/profile/ChangePasswordForm';
import { PersonalEmailForm } from '@/components/profile/PersonalEmailForm';
import { UserPostsFeed } from '@/components/profile/UserPostsFeed';
import { Spinner } from '@/components/ui/Spinner';
import type { ProfileTab } from '@/components/profile/ProfileTabs';

export default function ProfilePage() {
  const { user, updateLocalUser } = useAuth();
  const [tab, setTab] = useState<ProfileTab>('posts');

  if (!user) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
      <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-6">
        <ProfileHeader
          user={user}
          isOwn
          onPhotoUploaded={(photoUrl) => updateLocalUser({ photoUrl })}
          onCoverPhotoUploaded={(coverPhotoUrl) => updateLocalUser({ coverPhotoUrl })}
          tab={tab}
          onTabChange={setTab}
        />
        {tab === 'posts' && <UserPostsFeed userId={user._id} />}
        {tab === 'about' && (
          <div className="space-y-4">
            <EditProfileForm user={user} />
            <PersonalEmailForm />
            <ChangePasswordForm />
          </div>
        )}
      </div>
    </div>
  );
}
