import { Users } from 'lucide-react';

export default function GroupsIndexPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-2/70">
        <Users className="h-7 w-7 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground">اختر مجموعة أو أنشئ واحدة جديدة.</p>
    </div>
  );
}
