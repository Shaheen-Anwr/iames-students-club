'use client';

import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { EditProfileForm } from '@/components/profile/EditProfileForm';
import { ChangePasswordForm } from '@/components/profile/ChangePasswordForm';
import { PersonalEmailForm } from '@/components/profile/PersonalEmailForm';
import { PushNotificationsToggle } from '@/components/profile/PushNotificationsToggle';
import { NotificationSettings } from '@/components/profile/NotificationSettings';
import { CustomizeHomeCard } from '@/components/profile/CustomizeHomeCard';
import { ProfileFriendsTab } from '@/components/profile/ProfileFriendsTab';
import { UserPostsFeed } from '@/components/profile/UserPostsFeed';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import type { ProfileTab } from '@/components/profile/ProfileTabs';

// Groups the settings stack under scannable headings instead of one undifferentiated column.
function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export default function ProfilePage() {
  const { user, updateLocalUser, logout } = useAuth();
  const [tab, setTab] = useState<ProfileTab>('posts');
  const [loggingOut, setLoggingOut] = useState(false);

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
          <div className="space-y-6">
            <SettingsSection title="الملف الشخصي">
              <EditProfileForm user={user} />
            </SettingsSection>
            <SettingsSection title="الإشعارات">
              <PushNotificationsToggle />
              <NotificationSettings />
            </SettingsSection>
            <SettingsSection title="تخصيص">
              <CustomizeHomeCard />
            </SettingsSection>
            <SettingsSection title="الحساب والأمان">
              <PersonalEmailForm />
              <ChangePasswordForm />
            </SettingsSection>
            <Button
              variant="outline"
              className="w-full text-danger hover:bg-danger/10"
              loading={loggingOut}
              onClick={() => {
                setLoggingOut(true);
                void logout();
              }}
            >
              <LogOut className="h-4 w-4" />
              تسجيل الخروج
            </Button>
          </div>
        )}
        {tab === 'friends' && <ProfileFriendsTab profileId={user._id} isOwn />}
      </div>
    </div>
  );
}
