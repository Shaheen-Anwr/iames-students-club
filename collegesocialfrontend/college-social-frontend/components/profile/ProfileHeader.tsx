import { RoleBadge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { ViewablePhoto } from '@/components/ui/ViewablePhoto';
import { StreakPointsPill } from '@/components/gamification/StreakPointsPill';
import { DEPARTMENT_LABELS } from '@/lib/departments';
import { assetUrl } from '@/lib/utils';
import { cldOptimize } from '@/lib/images';
import type { User } from '@/lib/types';
import { AvatarUploader } from './AvatarUploader';
import { CoverPhotoUploader } from './CoverPhotoUploader';
import { ProfileTabs, type ProfileTab } from './ProfileTabs';

export function ProfileHeader({
  user,
  isOwn,
  onPhotoUploaded,
  onCoverPhotoUploaded,
  tab,
  onTabChange,
}: {
  user: User;
  isOwn: boolean;
  onPhotoUploaded?: (url: string | null) => void;
  onCoverPhotoUploaded?: (url: string | null) => void;
  tab: ProfileTab;
  onTabChange: (tab: ProfileTab) => void;
}) {
  const rawCover = assetUrl(user.coverPhotoUrl);

  return (
    <div className="overflow-hidden rounded-xl2 border border-border bg-surface shadow-soft">
      {isOwn && onCoverPhotoUploaded ? (
        <CoverPhotoUploader coverPhotoUrl={rawCover} onUploaded={onCoverPhotoUploaded} />
      ) : rawCover ? (
        <ViewablePhoto src={cldOptimize(rawCover, { width: 1600 })} alt="صورة الغلاف" className="block w-full">
          <div
            className="h-36 bg-cover bg-center sm:h-48"
            style={{ backgroundImage: `url(${cldOptimize(rawCover, { width: 1280, height: 400, crop: 'fill' })})` }}
          />
        </ViewablePhoto>
      ) : (
        <div className="h-36 bg-gradient-to-l from-background via-surface-2 to-accent/20 sm:h-48" />
      )}
      <div className="px-5 pb-2 sm:px-6">
        <div className="-mt-14 flex items-end gap-4 sm:-mt-16">
          {isOwn && onPhotoUploaded ? (
            <AvatarUploader photoUrl={assetUrl(user.photoUrl)} name={user.name} onUploaded={onPhotoUploaded} />
          ) : (
            <Avatar
              src={assetUrl(user.photoUrl)}
              name={user.name}
              size="xl"
              ring
              viewable
              className="h-24 w-24 border-4 border-surface text-3xl sm:h-28 sm:w-28"
            />
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">{user.name}</h1>
          <RoleBadge role={user.role} />
          {user.department && (
            <span className="rounded-full bg-surface-2/70 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              {DEPARTMENT_LABELS[user.department]}
            </span>
          )}
        </div>

        <StreakPointsPill user={user} size="lg" className="mt-4 max-w-md" />

        <div className="mt-4">
          <ProfileTabs active={tab} onChange={onTabChange} friendsCount={user.friends?.length} />
        </div>
      </div>
    </div>
  );
}
