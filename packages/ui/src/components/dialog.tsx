'use client';
import { X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export type DialogContentProps = ComponentProps<typeof DialogPrimitive.Content> & {
  /** Nom accessible du bouton de fermeture (texte traduit fourni par l'appelant). */
  closeLabel: string;
};

/** Modale : seule surface avec une ombre (DS §4). */
export function DialogContent({ className, children, closeLabel, ...props }: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="bg-obsidienne/60 fixed inset-0 z-50" />
      <DialogPrimitive.Content
        className={cn(
          'border-line bg-panel text-ink shadow-float fixed inset-x-4 top-1/2 z-50 mx-auto max-w-md -translate-y-1/2 rounded-lg border p-6',
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          aria-label={closeLabel}
          className="text-muted hover:text-ink absolute top-2 right-2 inline-flex size-11 items-center justify-center rounded-md"
        >
          <X aria-hidden="true" className="size-5" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn('pr-10 text-lg font-bold', className)} {...props} />;
}

export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description className={cn('text-muted mt-2 text-sm', className)} {...props} />
  );
}
