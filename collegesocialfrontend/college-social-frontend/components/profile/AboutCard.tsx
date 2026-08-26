import { Calendar, GraduationCap, IdCard, BookMarked, User as UserIcon } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { BadgeShelf } from '@/components/gamification/BadgeShelf';
import { ROLE_LABELS, type User } from '@/lib/types';
import { DEPARTMENT_LABELS } from '@/lib/departments';
import { ACADEMIC_YEAR_LABELS } from '@/lib/academic-years';
import { SPECIALIZATION_LABELS } from '@/lib/specializations';

export function AboutCard({ user }: { user: User }) {
  const joined = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long' })
    : null;

  return (
    <Card className="p-5">
      <h2 className="mb-4 text-sm font-semibold text-foreground">معلومات</h2>
      <dl className="space-y-4 text-sm">
        {user.bio && (
          <div className="flex items-start gap-3">
            <UserIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <dd className="whitespace-pre-wrap text-foreground">{user.bio}</dd>
          </div>
        )}
        <div className="flex items-center gap-3">
          <IdCard className="h-4 w-4 shrink-0 text-muted-foreground" />

        </div>
        {user.role !== 'admin' && (
          <div className="flex items-center gap-3">
            <GraduationCap className="h-4 w-4 shrink-0 text-muted-foreground" />
            <dd className="text-foreground">{ROLE_LABELS[user.role]} بالأكاديمية</dd>
          </div>
        )}
        {user.department && (
          <div className="flex items-center gap-3">
            <BookMarked className="h-4 w-4 shrink-0 text-muted-foreground" />
            <dd className="text-foreground">{DEPARTMENT_LABELS[user.department]}</dd>
          </div>
        )}
        {user.academicYear && (
          <div className="flex items-center gap-3">
            <GraduationCap className="h-4 w-4 shrink-0 text-muted-foreground" />
            <dd className="text-foreground">{ACADEMIC_YEAR_LABELS[user.academicYear]}</dd>
          </div>
        )}
        {user.specialization && (
          <div className="flex items-center gap-3">
            <BookMarked className="h-4 w-4 shrink-0 text-muted-foreground" />
            <dd className="text-foreground">{SPECIALIZATION_LABELS[user.specialization]}</dd>
          </div>
        )}
        {joined && (
          <div className="flex items-center gap-3">
            <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
            <dd className="text-foreground">انضم في {joined}</dd>
          </div>
        )}
      </dl>
      <div className="mt-5 border-t border-border pt-4">
        <h3 className="mb-2.5 text-xs font-semibold text-muted-foreground">الإنجازات</h3>
        <BadgeShelf badges={user.badges ?? []} />
      </div>
    </Card>
  );
}
