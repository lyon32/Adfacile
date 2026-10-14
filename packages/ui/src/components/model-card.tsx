import type { ChangeEventHandler } from 'react';
import { cn } from '../lib/cn';

export interface ModelCardProps {
  /** Nom du groupe de boutons radio (un choix par groupe). */
  name: string;
  value: string;
  checked: boolean;
  onChange: ChangeEventHandler<HTMLInputElement>;
  title: string;
  provider: string;
  description: string;
  pros?: readonly string[];
  cons?: readonly string[];
  /** « Recommandé pour ton cas » : absent si le modèle n'est pas recommandé. */
  recommendedLabel?: string;
  /** « Très demandé · attente ~2 min » : absent si le modèle est disponible. */
  busyLabel?: string;
  /** « 12 crédits » : calculé par l'appelant, jamais ici. */
  costLabel: string;
  /** « pour 3 visuels · ~40 s ». */
  costDetail?: string;
  disabled?: boolean;
}

/** Carte de choix d'un modèle de génération (docs/design/prototype-choix-modele.html). */
export function ModelCard({
  name,
  value,
  checked,
  onChange,
  title,
  provider,
  description,
  pros = [],
  cons = [],
  recommendedLabel,
  busyLabel,
  costLabel,
  costDetail,
  disabled = false,
}: ModelCardProps) {
  return (
    <label
      className={cn(
        'bg-panel text-ink has-[:focus-visible]:outline-focus grid cursor-pointer grid-cols-[auto_1fr] gap-x-3 gap-y-3 rounded-lg border p-4 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 sm:grid-cols-[auto_1fr_auto]',
        checked ? 'border-focus border-2' : 'border-line',
        disabled ? 'cursor-not-allowed opacity-50' : null,
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="accent-focus mt-1 size-5 focus-visible:outline-none"
      />
      <span className="flex min-w-0 flex-col gap-1.5">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-bold">{title}</span>
          <span className="text-meta text-muted">{provider}</span>
          {recommendedLabel ? (
            <span className="rounded-pill bg-accent text-on-accent px-2 py-0.5 text-xs font-bold">
              {recommendedLabel}
            </span>
          ) : null}
        </span>
        <span className="text-muted text-sm">{description}</span>
        {pros.length + cons.length > 0 ? (
          <span className="flex flex-wrap gap-1.5">
            {pros.map((p) => (
              <span key={`+${p}`} className="border-line rounded-sm border px-2 py-0.5 text-xs">
                + {p}
              </span>
            ))}
            {cons.map((c) => (
              <span
                key={`-${c}`}
                className="border-line text-muted rounded-sm border px-2 py-0.5 text-xs"
              >
                − {c}
              </span>
            ))}
          </span>
        ) : null}
        {busyLabel ? (
          <span className="text-meta text-warn flex items-center gap-2 font-semibold">
            <span aria-hidden="true" className="rounded-pill bg-warn size-2" />
            {busyLabel}
          </span>
        ) : null}
      </span>
      <span className="col-start-2 flex flex-col tabular-nums sm:col-start-3 sm:items-end sm:text-right">
        <span className="font-bold">{costLabel}</span>
        {costDetail ? <span className="text-meta text-muted">{costDetail}</span> : null}
      </span>
    </label>
  );
}
