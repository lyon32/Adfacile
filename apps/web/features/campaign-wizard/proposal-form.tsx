'use client';
// Modification d'une proposition retenue (APPFLOW §8.3 : objectif avec description courte, zone, budget avec conversion en direct,
// dates, textes avec compteur, bouton). Les mêmes limites que le serveur, qui revalide tout. Le formulaire est un brouillon de
// saisie (état local) : la campagne, elle, reste dans TanStack Query.
import { Button, Field, cn, formatXaf, type UiLocale } from '@pubeka/ui';
import { Check, Plus, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { CTAS, OBJECTIVES, OBJECTIVE_DESTINATIONS } from './proposal-api';
import {
  LIMITS,
  MAX_INTERESTS,
  codePointLength,
  estimateXaf,
  parseUsdInput,
  validateForm,
  withObjective,
  type EditForm,
  type FormErrors,
} from './proposal-model';
import { TextAreaField } from './text-area-field';

export interface ProposalFormProps {
  initial: EditForm;
  /** Date du jour (AAAA-MM-JJ) dans le fuseau de la personne. */
  today: string;
  /** FCFA pour 1 $ (le serveur fait foi) : sert seulement à l'indication en direct. */
  xafPerUsd: number | null;
  pending: boolean;
  serverError: string | null;
  onSubmit: (form: EditForm) => void;
  onCancel: () => void;
}

function Choice({
  checked,
  onSelect,
  title,
  hint,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  hint?: string;
}): ReactNode {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={cn(
        'bg-panel flex min-h-11 items-start justify-between gap-3 rounded-md border px-4 py-2.5 text-left',
        checked ? 'border-ink border-2' : 'border-line',
      )}
    >
      <span className="flex flex-col">
        <span className={cn('text-base', checked ? 'font-semibold' : null)}>{title}</span>
        {hint === undefined ? null : <span className="text-meta text-muted">{hint}</span>}
      </span>
      {checked ? <Check aria-hidden="true" className="mt-1 size-4 shrink-0" /> : null}
    </button>
  );
}

export function ProposalForm({
  initial,
  today,
  xafPerUsd,
  pending,
  serverError,
  onSubmit,
  onCancel,
}: ProposalFormProps): ReactNode {
  const t = useTranslations('campaign.wizard.proposal');
  const locale = useLocale();
  const ui: UiLocale = locale === 'en' ? 'en' : 'fr';
  const [form, setForm] = useState<EditForm>(initial);
  const [showErrors, setShowErrors] = useState(false);
  const [newInterest, setNewInterest] = useState('');

  const errors: FormErrors = validateForm(form, today);
  const shown = (field: string): string | undefined => {
    const key = errors[field];
    return showErrors && key !== undefined ? t(`errors.${key}`) : undefined;
  };
  const set = <K extends keyof EditForm>(key: K, value: EditForm[K]): void => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const cents = parseUsdInput(form.budget);
  const estimated = cents !== null && xafPerUsd !== null ? estimateXaf(cents, xafPerUsd) : null;
  const fcfa = estimated === null ? null : formatXaf(estimated, ui);

  function submit(): void {
    setShowErrors(true);
    if (Object.keys(errors).length > 0) return;
    onSubmit(form);
  }

  function addInterest(): void {
    const name = newInterest.trim();
    if (
      name === '' ||
      form.interests.some((i) => i.toLocaleLowerCase(locale) === name.toLocaleLowerCase(locale))
    ) {
      setNewInterest('');
      return;
    }
    set('interests', [...form.interests, name]);
    setNewInterest('');
  }

  return (
    <form
      aria-labelledby="proposal-form-title"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="flex flex-col gap-6"
    >
      <h2 id="proposal-form-title" className="text-title text-xl font-bold">
        {t('form.title')}
      </h2>

      <div role="radiogroup" aria-label={t('form.objective')} className="flex flex-col gap-2">
        <p className="tracking-eyebrow text-muted text-xs font-bold uppercase">
          {t('form.objective')}
        </p>
        {OBJECTIVES.map((objective) => (
          <Choice
            key={objective}
            checked={form.objective === objective}
            onSelect={() => {
              setForm((current) => withObjective(current, objective));
            }}
            title={t(`objectives.${objective}`)}
            hint={t(`objective_hints.${objective}`)}
          />
        ))}
      </div>

      <div role="radiogroup" aria-label={t('form.destination')} className="flex flex-col gap-2">
        <p className="tracking-eyebrow text-muted text-xs font-bold uppercase">
          {t('form.destination')}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {OBJECTIVE_DESTINATIONS[form.objective].map((destination) => (
            <Choice
              key={destination}
              checked={form.destination === destination}
              onSelect={() => {
                set('destination', destination);
              }}
              title={t(`destinations.${destination}`)}
            />
          ))}
        </div>
        {shown('destination') === undefined ? null : (
          <p role="alert" className="text-meta text-error font-semibold">
            {shown('destination')}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <p className="tracking-eyebrow text-muted text-xs font-bold uppercase">{t('form.zone')}</p>
        {form.cities.map((city, index) => (
          <div key={index} className="grid grid-cols-[1fr_6rem_auto] items-start gap-2">
            <Field
              className="min-w-0"
              label={t('form.city_name')}
              value={city.name}
              maxLength={100}
              error={shown(`city.${String(index)}.name`)}
              onChange={(event) => {
                set(
                  'cities',
                  form.cities.map((c, i) => (i === index ? { ...c, name: event.target.value } : c)),
                );
              }}
            />
            <Field
              className="min-w-0"
              label={t('form.city_radius')}
              value={city.radius}
              inputMode="numeric"
              maxLength={3}
              error={shown(`city.${String(index)}.radius`)}
              onChange={(event) => {
                set(
                  'cities',
                  form.cities.map((c, i) =>
                    i === index ? { ...c, radius: event.target.value } : c,
                  ),
                );
              }}
            />
            <Button
              type="button"
              variant="quiet"
              size="icon"
              aria-label={t('actions.remove_city', { name: city.name })}
              onClick={() => {
                set(
                  'cities',
                  form.cities.filter((_, i) => i !== index),
                );
              }}
            >
              <X aria-hidden="true" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="quiet"
          size="sm"
          className="self-start"
          onClick={() => {
            set('cities', [...form.cities, { name: '', radius: '10' }]);
          }}
        >
          <Plus aria-hidden="true" />
          {t('actions.add_city')}
        </Button>
      </div>

      <Field
        label={t('form.budget')}
        unit={t('form.budget_unit')}
        value={form.budget}
        inputMode="decimal"
        maxLength={10}
        error={shown('budget')}
        hint={t('form.budget_hint', { fcfa: fcfa ?? '—' })}
        onChange={(event) => {
          set('budget', event.target.value);
        }}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={t('form.start_date')}
          type="date"
          value={form.startDate}
          min={today}
          error={shown('startDate')}
          onChange={(event) => {
            set('startDate', event.target.value);
          }}
        />
        <Field
          label={t('form.end_date')}
          type="date"
          value={form.endDate}
          min={form.startDate === '' ? today : form.startDate}
          error={shown('endDate')}
          onChange={(event) => {
            set('endDate', event.target.value);
          }}
        />
      </div>

      <TextAreaField
        label={t('form.primary_text')}
        value={form.primaryText}
        error={shown('primaryText')}
        counter={t('form.counter', {
          count: codePointLength(form.primaryText),
          max: LIMITS.primaryText,
        })}
        onChange={(event) => {
          set('primaryText', event.target.value);
        }}
      />
      <Field
        label={t('form.headline')}
        value={form.headline}
        error={shown('headline')}
        hint={t('form.counter', { count: codePointLength(form.headline), max: LIMITS.headline })}
        onChange={(event) => {
          set('headline', event.target.value);
        }}
      />
      <Field
        label={t('form.description')}
        value={form.description}
        error={shown('description')}
        hint={t('form.counter', {
          count: codePointLength(form.description),
          max: LIMITS.description,
        })}
        onChange={(event) => {
          set('description', event.target.value);
        }}
      />

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="proposal-cta"
          className="tracking-eyebrow text-muted text-xs font-bold uppercase"
        >
          {t('form.cta')}
        </label>
        <select
          id="proposal-cta"
          value={form.cta}
          onChange={(event) => {
            const next = CTAS.find((cta) => cta === event.target.value);
            if (next !== undefined) set('cta', next);
          }}
          className="border-field-line bg-panel text-ink focus-visible:border-focus min-h-12 rounded-md border px-4 text-base focus-visible:border-2 focus-visible:outline-none"
        >
          {CTAS.map((cta) => (
            <option key={cta} value={cta}>
              {t(`ctas.${cta}`)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-3">
        <p className="tracking-eyebrow text-muted text-xs font-bold uppercase">
          {t('form.interests')}
        </p>
        <p className="text-meta text-muted">{t('form.interests_hint')}</p>
        {form.interests.length === 0 ? null : (
          <ul className="flex flex-wrap gap-2">
            {form.interests.map((name) => (
              <li
                key={name}
                className="border-line flex items-center gap-1 rounded-md border py-1 pr-1 pl-3 text-sm"
              >
                {name}
                <button
                  type="button"
                  aria-label={t('actions.remove_interest', { name })}
                  onClick={() => {
                    set(
                      'interests',
                      form.interests.filter((i) => i !== name),
                    );
                  }}
                  className="grid size-8 place-items-center rounded-md"
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {form.interests.length >= MAX_INTERESTS ? (
          <p role="alert" className="text-meta text-error font-semibold">
            {t('errors.interests_too_many')}
          </p>
        ) : (
          <div className="grid grid-cols-[1fr_auto] items-start gap-2">
            <Field
              className="min-w-0"
              label={t('form.interest_label')}
              value={newInterest}
              maxLength={80}
              onChange={(event) => {
                setNewInterest(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addInterest();
                }
              }}
            />
            <Button type="button" variant="quiet" className="mt-0" onClick={addInterest}>
              {t('actions.add_interest')}
            </Button>
          </div>
        )}
      </div>

      <div aria-live="polite" className="flex flex-col gap-3">
        {serverError === null ? null : (
          <p role="alert" className="text-error text-sm font-semibold">
            {serverError}
          </p>
        )}
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button type="submit" className="w-full sm:w-auto" disabled={pending}>
            {pending ? t('actions.saving') : t('actions.save')}
          </Button>
          <Button type="button" variant="quiet" className="w-full sm:w-auto" onClick={onCancel}>
            {t('actions.cancel')}
          </Button>
        </div>
      </div>
    </form>
  );
}
