import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

/** Carte : bordure 1 px + fond panneau, pas d'ombre (DS §4). */
export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('border-line bg-panel text-ink rounded-lg border p-4 sm:p-6', className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: ComponentProps<'h3'>) {
  return <h3 className={cn('text-title font-semibold', className)} {...props} />;
}

export function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('text-meta text-muted', className)} {...props} />;
}

/** Sur-titre : capitales, précédé d'un carré Lime 8 px (DS §3). */
export function Eyebrow({ className, children, ...props }: ComponentProps<'p'>) {
  return (
    <p
      className={cn(
        'tracking-eyebrow text-muted flex items-center gap-2 text-xs font-bold uppercase',
        className,
      )}
      {...props}
    >
      <span aria-hidden="true" className="bg-accent size-2" />
      {children}
    </p>
  );
}
