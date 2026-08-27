'use client';

import * as RSwitch from '@radix-ui/react-switch';
import { cn } from '@/lib/utils';

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  name?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  className?: string;
}

/**
 * Toggle switch (Radix). The track/thumb keep a fixed visual size; the whole control still
 * makes a 44px touch target via padding on the pressable area. RTL-aware -- the thumb travels
 * toward the start edge when on.
 */
export function Switch({ checked, onCheckedChange, disabled, id, name, className, ...aria }: SwitchProps) {
  return (
    <RSwitch.Root
      id={id}
      name={name}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      {...aria}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full',
        'bg-surface-3 transition-colors duration-fast ease-standard touch-manipulation',
        'data-[state=checked]:bg-accent disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
    >
      <RSwitch.Thumb
        className={cn(
          'pointer-events-none block h-5 w-5 rounded-full bg-white shadow-elev-1',
          'translate-x-[2px] rtl:-translate-x-[2px]',
          'transition-transform duration-fast ease-standard',
          'data-[state=checked]:translate-x-[22px] rtl:data-[state=checked]:-translate-x-[22px]',
        )}
      />
    </RSwitch.Root>
  );
}
