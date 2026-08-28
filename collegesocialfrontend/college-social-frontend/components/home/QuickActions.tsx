import Link from 'next/link';
import { ArrowLeft, ClipboardList, HelpCircle, Megaphone, PenSquare, Users } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/lib/auth-context';

const STUDENT_ACTIONS = [
  { href: '/feed', label: 'منشور جديد', icon: PenSquare, classes: 'bg-accent/10 text-accent ring-accent/15' },
  { href: '/study/qa', label: 'اطرح سؤالًا', icon: HelpCircle, classes: 'bg-warning/10 text-warning ring-warning/15' },
  { href: '/groups/discover', label: 'انضم لمجموعة دراسة', icon: Users, classes: 'bg-success/10 text-success ring-success/15' },
];

const PROFESSOR_ACTIONS = [
  { href: '/study/assignments?new=1', label: 'إنشاء واجب', icon: ClipboardList, classes: 'bg-accent/10 text-accent ring-accent/15' },
  { href: '/home?announce=1', label: 'نشر إعلان', icon: Megaphone, classes: 'bg-warning/10 text-warning ring-warning/15' },
  { href: '/groups/discover', label: 'انضم لمجموعة دراسة', icon: Users, classes: 'bg-success/10 text-success ring-success/15' },
];

export function QuickActions() {
  const { user } = useAuth();
  const actions = user?.role === 'professor' ? PROFESSOR_ACTIONS : STUDENT_ACTIONS;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {actions.map(({ href, label, icon: Icon, classes }) => (
        <Link key={href} href={href} className="group">
          <Card interactive className="flex items-center gap-3 p-4">
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${classes}`}>
              <Icon className="h-5 w-5" />
            </div>
            <p className="flex-1 text-sm font-semibold text-foreground">{label}</p>
            <ArrowLeft className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-all group-hover:-translate-x-0.5 group-hover:text-accent" />
          </Card>
        </Link>
      ))}
    </div>
  );
}
