import { useId, type ComponentProps, type ReactNode } from 'react';
import { cn } from '../lib/cn';

export type FieldProps = Omit<ComponentProps<'input'>, 'id'> & {
  label: string;
  hint?: ReactNode;
  error?: ReactNode;
  /** Unité affichée à droite (« FCFA »). */
  unit?: string;
  id?: string;
};

/** Champ à étiquette encastrée dans la bordure (DS §5, réf. 04). */
export function Field({ label, hint, error, unit, id, className, ...props }: FieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div
        className={cn(
          'border-field-line bg-panel focus-within:border-focus relative flex h-12 items-center rounded-md border focus-within:border-2',
          error ? 'border-error border-2' : null,
        )}
      >
        <label
          htmlFor={inputId}
          className="bg-panel text-muted absolute -top-2.5 left-3 px-1 text-xs font-semibold"
        >
          {label}
        </label>
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className="text-ink placeholder:text-muted h-full min-w-0 flex-1 rounded-md bg-transparent px-4 text-base tabular-nums outline-none"
          {...props}
        />
        {unit ? <span className="text-muted pr-4 text-sm font-semibold">{unit}</span> : null}
      </div>
      {hint ? (
        <p id={hintId} className="text-meta text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-meta text-error font-semibold">
          {error}
        </p>
      ) : null}
    </div>
  );
}
