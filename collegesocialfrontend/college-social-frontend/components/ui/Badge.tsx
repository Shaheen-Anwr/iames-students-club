import { GraduationCap, BookOpen, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ROLE_LABELS, type Role } from '@/lib/types';

const ROLE_CONFIG: Record<Role, { label: string; classes: string; icon: typeof GraduationCap }> = {
  admin: { label: ROLE_LABELS.admin, classes: 'bg-surface-2 text-muted-foreground', icon: ShieldCheck },
  professor: { label: ROLE_LABELS.professor, classes: 'bg-gold/15 text-gold', icon: BookOpen },
  student: { label: ROLE_LABELS.student, classes: 'bg-accent/15 text-accent', icon: GraduationCap },
};

export function RoleBadge({ role, className }: { role: Role; className?: string }) {
  if (role === 'admin' || !ROLE_CONFIG[role]) return null;
  const { label, classes, icon: Icon } = ROLE_CONFIG[role];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
        classes,
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

type BadgeVariant = 'default' | 'success' | 'danger' | 'warning' | 'accent';

const BADGE_VARIANT_CLASSES: Record<BadgeVariant, string> = {
  default: 'bg-surface-2 text-muted-foreground',
  success: 'bg-success/15 text-success',
  danger: 'bg-danger/15 text-danger',
  warning: 'bg-warning/15 text-warning',
  accent: 'bg-accent/15 text-accent',
};

export function Badge({
  variant = 'default',
  className,
  children,
}: {
  variant?: BadgeVariant;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
        BADGE_VARIANT_CLASSES[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
