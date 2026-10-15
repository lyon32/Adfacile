// Zone de texte à étiquette encastrée (DS §5, même apparence que `Field`).
import { cn } from '@pubeka/ui';
import { useId, type ComponentProps, type ReactNode } from 'react';

export type TextAreaFieldProps = Omit<ComponentProps<'textarea'>, 'id'> & {
  label: string;
  hint?: ReactNode;
  error?: ReactNode;
  /** Compteur « 120 / 5 000 », lu en même temps que l'aide. */
  counter?: ReactNode;
};

export function TextAreaField({
  label,
  hint,
  error,
  counter,
  className,
  ...props
}: TextAreaFieldProps): ReactNode {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div
        className={cn(
          'border-field-line bg-panel focus-within:border-focus relative rounded-md border focus-within:border-2',
          error ? 'border-error border-2' : null,
        )}
      >
        <label
          htmlFor={id}
          className="bg-panel text-muted absolute -top-2.5 left-3 px-1 text-xs font-semibold"
        >
          {label}
        </label>
        <textarea
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          rows={4}
          className="text-ink placeholder:text-muted block min-h-28 w-full resize-y rounded-md bg-transparent px-4 py-3 text-base outline-none"
          {...props}
        />
      </div>
      <div className="flex items-start justify-between gap-3">
        {hint ? (
          <p id={hintId} className="text-meta text-muted">
            {hint}
          </p>
        ) : (
          <span />
        )}
        {counter ? (
          <p className="text-meta text-muted shrink-0 tabular-nums" aria-hidden="true">
            {counter}
          </p>
        ) : null}
      </div>
      {error ? (
        <p id={errorId} className="text-meta text-error font-semibold">
          {error}
        </p>
      ) : null}
    </div>
  );
}
