'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PanelLeftClose, PanelLeftOpen, ShieldCheck } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';
import { nf } from '@/lib/format';
import { ADMIN_NAV, activeNavItem, type NavItem } from './nav';
import { useConsoleUi } from './ConsoleUiContext';
import { useAdminStats } from '../AdminStatsProvider';

interface ConsoleSidebarProps {
  /** `rail` = the desktop in-layout column (collapsible). `drawer` = inside the mobile Sheet. */
  variant: 'rail' | 'drawer';
  onNavigate?: () => void;
}

export function ConsoleSidebar({ variant, onNavigate }: ConsoleSidebarProps) {
  const pathname = usePathname();
  const { user } = useAuth();
  const { railCollapsed, toggleRail } = useConsoleUi();
  const { needsAttention } = useAdminStats();

  const collapsed = variant === 'rail' && railCollapsed;
  const activeHref = activeNavItem(pathname)?.href;
  const isSuper = !!user?.isSuperAdmin;

  function badgeFor(item: NavItem): number {
    if (item.badgeKey === 'pendingVerifications') return needsAttention.pendingVerifications;
    return 0;
  }

  return (
    <div className="flex h-full flex-col">
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-4',
          collapsed && 'flex-col gap-3 px-0',
        )}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <ShieldCheck className="h-[18px] w-[18px]" />
        </span>
        {!collapsed && <span className="flex-1 truncate text-sm font-semibold text-foreground">لوحة الإدارة</span>}
        {variant === 'rail' && (
          <button
            onClick={toggleRail}
            aria-label={collapsed ? 'توسيع القائمة' : 'طيّ القائمة'}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        )}
      </div>

      <nav className="min-h-0 flex-1 space-y-4 overflow-y-auto scrollbar-thin px-2 pb-4">
        {ADMIN_NAV.map((section, si) => {
          const items = section.items.filter((i) => !i.superAdmin || isSuper);
          if (items.length === 0) return null;
          return (
            <div key={si} className="space-y-0.5">
              {section.label && !collapsed && (
                <p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {section.label}
                </p>
              )}
              {section.label && collapsed && si > 0 && <div className="mx-2 my-2 border-t border-border/60" />}
              {items.map((item) => {
                const Icon = item.icon;
                const active = activeHref === item.href;
                const badge = badgeFor(item);
                const link = (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors',
                      'before:absolute before:inset-y-1.5 before:start-0 before:w-0.5 before:rounded-full before:transition-colors',
                      active
                        ? 'bg-accent/10 text-accent before:bg-accent'
                        : 'text-muted-foreground before:bg-transparent hover:bg-surface-2 hover:text-foreground',
                      collapsed && 'justify-center px-0',
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                    {!collapsed && badge > 0 && (
                      <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-warning/15 px-1 text-[10px] font-bold text-warning">
                        {nf(badge)}
                      </span>
                    )}
                    {collapsed && badge > 0 && (
                      <span className="absolute end-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-warning" />
                    )}
                  </Link>
                );
                return collapsed ? (
                  <Tooltip key={item.href} content={item.label} side="end" wrapperClassName="block">
                    {link}
                  </Tooltip>
                ) : (
                  link
                );
              })}
            </div>
          );
        })}
      </nav>
    </div>
  );
}
