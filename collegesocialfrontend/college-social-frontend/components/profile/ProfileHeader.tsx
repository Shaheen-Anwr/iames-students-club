import type { ReactNode } from 'react';
import { Pencil } from 'lucide-react';
import { RoleBadge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { ViewablePhoto } from '@/components/ui/ViewablePhoto';
import { StreakPointsPill } from '@/components/gamification/StreakPointsPill';
import { DEPARTMENT_LABELS } from '@/lib/departments';
import { assetUrl } from '@/lib/utils';
import { cldOptimize } from '@/lib/images';
import type { User } from '@/lib/types';
import { ShareButton } from '@/components/shared/ShareButton';
import { AvatarUploader } from './AvatarUploader';
import { CoverPhotoUploader } from './CoverPhotoUploader';
import type { ProfileTab } from './ProfileTabs';

export function ProfileHeader({
  user,
  isOwn,
  onPhotoUploaded,
  onCoverPhotoUploaded,
  onTabChange,
  actions,
}: {
  user: User;
  isOwn: boolean;
  onPhotoUploaded?: (url: string | null) => void;
  onCoverPhotoUploaded?: (url: string | null) => void;
  onTabChange: (tab: ProfileTab) => void;
  actions?: ReactNode;
}) {
  const rawCover = assetUrl(user.coverPhotoUrl);

  return (
    <div className="vt-profile-header overflow-hidden rounded-xl2 border border-border/80 bg-surface shadow-elev-1">
      {isOwn && onCoverPhotoUploaded ? (
        <CoverPhotoUploader coverPhotoUrl={rawCover} onUploaded={onCoverPhotoUploaded} />
      ) : rawCover ? (
        <ViewablePhoto src={cldOptimize(rawCover, { width: 1600 })} alt="صورة الغلاف" className="block w-full">
          <div
            className="h-44 bg-cover bg-center sm:h-56"
            style={{ backgroundImage: `url(${cldOptimize(rawCover, { width: 1280, height: 400, crop: 'fill' })})` }}
          />
        </ViewablePhoto>
      ) : (
        <div className="bg-mesh h-44 bg-surface-2 sm:h-56" />
      )}
      <div className="px-5 pb-2 sm:px-6">
        <div className="-mt-16 flex items-end gap-4 sm:-mt-20">
          {isOwn && onPhotoUploaded ? (
            <AvatarUploader photoUrl={assetUrl(user.photoUrl)} name={user.name} onUploaded={onPhotoUploaded} />
          ) : (
            <Avatar
              src={assetUrl(user.photoUrl)}
              name={user.name}
              size="xl"
              ring
              viewable
              fit="cover"
              className="h-28 w-28 rounded-2xl border-4 border-surface bg-surface-2 text-3xl shadow-elev-2 sm:h-32 sm:w-32"
            />
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{user.name}</h1>
          <RoleBadge role={user.role} />
          {user.department && (
            <span className="rounded-full bg-surface-2/70 px-2.5 py-0.5 text-xs font-medium text-muted-foreground ring-1 ring-inset ring-border/60">
              {DEPARTMENT_LABELS[user.department]}
            </span>
          )}
          <ShareButton
            className="ms-auto"
            variant="pill"
            label="مشاركة"
            heading="مشاركة الملف الشخصي"
            title={`${user.name} على اكاديميا`}
            text={user.bio ?? undefined}
            url={`/profile/${user._id}`}
          />
        </div>

        {(actions || isOwn) && (
          <div className="mt-4 flex flex-wrap gap-2">
            {actions}
            {isOwn && (
              <Button variant="outline" size="md" onClick={() => onTabChange('about')}>
                <Pencil className="h-4 w-4" />
                تعديل الملف
              </Button>
            )}
          </div>
        )}

        <StreakPointsPill user={user} size="lg" className="mt-5 max-w-md" />
      </div>
    </div>
  );
}
