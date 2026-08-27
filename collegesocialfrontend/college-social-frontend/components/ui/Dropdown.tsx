'use client';

import { useState } from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/lib/use-media-query';
import { Sheet } from './Sheet';

export interface DropdownItem {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

interface DropdownProps {
  trigger: React.ReactNode;
  items: DropdownItem[];
  align?: 'start' | 'end';
  placement?: 'bottom' | 'top';
  /** Heading for the mobile action sheet. */
  menuLabel?: string;
  /** Classes for the desktop menu panel. */
  className?: string;
}

/**
 * Overflow / action menu. On phones it opens a bottom action sheet with finger-sized rows; on
 * desktop it's an anchored Radix menu with full keyboard support (arrows, Home/End, type-ahead,
 * ESC) and viewport collision handling. RTL alignment comes from the app-wide DirectionProvider.
 *
 * API unchanged: pass a `trigger` node and `items`.
 */
export function Dropdown({
  trigger,
  items,
  align = 'end',
  placement = 'bottom',
  menuLabel = 'خيارات',
  className,
}: DropdownProps) {
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);

  if (isMobile) {
    return (
      <>
        <button type="button" onClick={() => setSheetOpen(true)} className="inline-flex">
          {trigger}
        </button>
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen} title={menuLabel}>
          <div className="flex flex-col">
            {items.map((item, i) => (
              <button
                key={i}
                type="button"
                disabled={item.disabled}
                onClick={() => {
                  setSheetOpen(false);
                  item.onClick();
                }}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-3 py-3.5 text-start text-[15px] font-medium transition-colors disabled:opacity-50',
                  item.destructive
                    ? 'text-danger active:bg-danger/10'
                    : 'text-foreground active:bg-surface-2',
                )}
              >
                {item.icon && <item.icon className="h-5 w-5 shrink-0" />}
                {item.label}
              </button>
            ))}
          </div>
        </Sheet>
      </>
    );
  }

  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        <button type="button" className="inline-flex outline-none">
          {trigger}
        </button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align={align}
          side={placement}
          sideOffset={8}
          collisionPadding={8}
          className={cn(
            'glass z-50 min-w-[12rem] rounded-xl p-1 shadow-elev-3',
            'data-[state=open]:animate-scale-in',
            className,
          )}
        >
          {items.map((item, i) => (
            <Menu.Item
              key={i}
              disabled={item.disabled}
              onSelect={() => item.onClick()}
              className={cn(
                'flex cursor-pointer select-none items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium outline-none transition-colors',
                'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
                item.destructive
                  ? 'text-danger data-[highlighted]:bg-danger/10'
                  : 'text-foreground data-[highlighted]:bg-surface-2',
              )}
            >
              {item.icon && <item.icon className="h-4 w-4 shrink-0" />}
              {item.label}
            </Menu.Item>
          ))}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
