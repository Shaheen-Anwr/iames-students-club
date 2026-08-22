import Link from 'next/link';
import { HelpCircle, PenSquare, Users } from 'lucide-react';
import { Card } from '@/components/ui/Card';

const ACTIONS = [
  { href: '/feed', label: 'منشور جديد', icon: PenSquare, classes: 'bg-accent/10 text-accent' },
  { href: '/study/qa', label: 'اطرح سؤالًا', icon: HelpCircle, classes: 'bg-warning/10 text-warning' },
  { href: '/groups/discover', label: 'انضم لمجموعة دراسة', icon: Users, classes: 'bg-success/10 text-success' },
];

export function QuickActions() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {ACTIONS.map(({ href, label, icon: Icon, classes }) => (
        <Link key={href} href={href}>
          <Card className="flex items-center gap-3 p-4 transition-transform hover:-translate-y-0.5 hover:shadow-card">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${classes}`}>
              <Icon className="h-5 w-5" />
            </div>
            <p className="text-sm font-medium text-foreground">{label}</p>
          </Card>
        </Link>
      ))}
    </div>
  );
}
