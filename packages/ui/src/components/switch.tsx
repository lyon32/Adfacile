'use client';
import { Switch as SwitchPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

/** Interrupteur 40×24 (DS §5) ; activé = Obsidienne (clair) / Lime (sombre). Cible tactile 44 px. */
export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'group relative inline-flex h-11 w-12 shrink-0 cursor-pointer items-center justify-center rounded-md disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className="rounded-pill border-field-line bg-line group-data-[state=checked]:border-focus group-data-[state=checked]:bg-focus flex h-6 w-10 items-center border p-0.5 transition-colors motion-reduce:transition-none"
      >
        <SwitchPrimitive.Thumb className="rounded-pill bg-bg block size-4.5 transition-transform data-[state=checked]:translate-x-4 motion-reduce:transition-none" />
      </span>
    </SwitchPrimitive.Root>
  );
}
