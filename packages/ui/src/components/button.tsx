import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

// DS §5 : principal (Lime, un seul par écran), secondaire (inversé), discret (bordure).
// Hauteur 44 px sur téléphone, 48 px au-delà ; cible tactile ≥ 44 px (TR-ACC-03).
export const buttonVariants = cva(
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-5 text-base font-bold whitespace-nowrap transition-colors motion-reduce:transition-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-5 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-on-accent hover:bg-accent-hover',
        secondary: 'bg-ink text-bg hover:opacity-90',
        quiet: 'border border-field-line bg-transparent text-ink hover:bg-panel',
      },
      size: {
        md: 'sm:min-h-12',
        sm: 'px-4 text-sm',
        icon: 'size-11 px-0',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button';
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
