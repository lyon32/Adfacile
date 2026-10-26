'use client';
// Bouton d'une page qui n'existe pas encore (`/abonnement` S24/S25, `/support` S28). Un bouton `disabled` n'est ni focalisable au clavier ni
// lisible au toucher : on garde un bouton focalisable en `aria-disabled`, qui ne fait rien, et le texte « Bientôt disponible » est
// AFFICHÉ dessous et relié par `aria-describedby` (lecteurs d'écran, toucher, clavier).
import { Button, cn, type ButtonProps } from '@pubeka/ui';
import { useId, type ReactNode } from 'react';

export function SoonButton({
  children,
  soonLabel,
  variant,
  className,
}: {
  children: ReactNode;
  soonLabel: string;
  variant?: ButtonProps['variant'];
  className?: string;
}): ReactNode {
  const noteId = useId();
  return (
    <span className="flex w-full flex-col items-start gap-1 sm:w-auto">
      <Button
        type="button"
        variant={variant}
        aria-disabled="true"
        aria-describedby={noteId}
        onClick={(event) => {
          event.preventDefault();
        }}
        className={cn('w-full cursor-not-allowed opacity-50 sm:w-auto', className)}
      >
        {children}
      </Button>
      <span id={noteId} className="text-meta text-muted">
        {soonLabel}
      </span>
    </span>
  );
}
