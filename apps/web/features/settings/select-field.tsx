// Liste déroulante native à étiquette encastrée (DS §5, même apparence que `Field`). Le
// contrôle natif garde le clavier, le lecteur d'écran et le sélecteur du téléphone.
import { cn } from '@pubeka/ui';
import { useId, type ComponentProps, type ReactNode } from 'react';

export type SelectFieldProps = Omit<ComponentProps<'select'>, 'id'> & {
  label: string;
  error?: ReactNode;
  options: readonly { value: string; label: string }[];
  placeholder?: string;
};

export function SelectField({
  label,
  error,
  options,
  placeholder,
  className,
  ...props
}: SelectFieldProps): ReactNode {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div
        className={cn(
          'border-field-line bg-panel focus-within:border-focus relative flex h-12 items-center rounded-md border focus-within:border-2',
          error ? 'border-error border-2' : null,
        )}
      >
        <label
          htmlFor={id}
          className="bg-panel text-muted absolute -top-2.5 left-3 px-1 text-xs font-semibold"
        >
          {label}
        </label>
        <select
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="text-ink h-full min-w-0 flex-1 rounded-md bg-transparent px-4 text-base outline-none"
          {...props}
        >
          {placeholder === undefined ? null : <option value="">{placeholder}</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      {error ? (
        <p id={errorId} className="text-meta text-error font-semibold">
          {error}
        </p>
      ) : null}
    </div>
  );
}
