'use client';
// Première configuration : une étape par écran, « Étape X sur 5 », [Continuer] (et [Plus tard]
// aux étapes 4 et 5). Chaque étape enregistre son réglage dans le profil avant d'avancer.
import { Button, Card, Field } from '@pubeka/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import type { Locale } from '@pubeka/i18n';
import { BrandKitPanel } from '../meta-connection/brand-kit-form';
import { ConnectionPanel, useMetaReadiness } from '../meta-connection/connection-panel';
import type { ConnectNotice } from '../meta-connection/notice';
import { SelectField } from '../settings/select-field';
import type { CountryOption } from '../shell/countries';
import { currencyOptions } from '../shell/currencies';
import { useUpdateMe } from '../shell/use-update-me';
import { STEPS, nextPath, stepNumber, type Step } from './steps';

export interface OnboardingProfile {
  countryCode: string | null;
  city: string | null;
  /** Code ISO 4217 de la monnaie d'affichage. */
  currency: string;
  locale: Locale;
}

function Progress({ step }: { step: Step }): ReactNode {
  const t = useTranslations('onboarding');
  const current = stepNumber(step);
  const text = t('progress', { step: current, total: STEPS.length });
  return (
    <div className="flex flex-col gap-2">
      <div
        role="progressbar"
        aria-label={t('progress_label')}
        aria-valuemin={1}
        aria-valuemax={STEPS.length}
        aria-valuenow={current}
        aria-valuetext={text}
        className="flex gap-1.5"
      >
        {STEPS.map((name, index) => (
          <span
            key={name}
            className={
              index < current
                ? 'bg-success h-1 flex-1 rounded-full'
                : 'bg-line h-1 flex-1 rounded-full'
            }
          />
        ))}
      </div>
      <p className="text-meta text-muted font-semibold">{text}</p>
    </div>
  );
}

function CountryStep({
  countries,
  profile,
  onSaved,
}: {
  countries: readonly CountryOption[];
  profile: OnboardingProfile;
  onSaved: () => void;
}): ReactNode {
  const t = useTranslations('onboarding');
  const update = useUpdateMe();
  const [country, setCountry] = useState(profile.countryCode ?? '');
  const [city, setCity] = useState(profile.city ?? '');
  const [currency, setCurrency] = useState<string>(profile.currency);
  const [missing, setMissing] = useState(false);

  const submit = (): void => {
    if (country === '') {
      setMissing(true);
      return;
    }
    update.mutate(
      { country_code: country, city: city.trim(), currency_display: currency },
      { onSuccess: onSaved },
    );
  };

  return (
    <form
      className="flex flex-col gap-5"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <SelectField
        label={t('country.country')}
        value={country}
        placeholder={t('country.country_placeholder')}
        options={countries.map((c) => ({ value: c.code, label: c.name }))}
        error={missing && country === '' ? t('country.country_required') : undefined}
        onChange={(event) => {
          const code = event.target.value;
          setCountry(code);
          // La monnaie du pays est proposée d'office (APPFLOW §5, étape 1).
          const found = countries.find((c) => c.code === code);
          if (found !== undefined) setCurrency(found.currency);
        }}
      />
      <Field
        label={t('country.city')}
        value={city}
        maxLength={120}
        autoComplete="address-level2"
        onChange={(event) => {
          setCity(event.target.value);
        }}
      />
      <SelectField
        label={t('country.currency')}
        value={currency}
        options={currencyOptions(
          countries.find((c) => c.code === country)?.currency ?? currency,
          profile.locale,
        )}
        onChange={(event) => {
          setCurrency(event.target.value);
        }}
      />
      <Actions pending={update.isPending} failed={update.isError} />
    </form>
  );
}

function LanguageStep({
  profile,
  onSaved,
}: {
  profile: OnboardingProfile;
  onSaved: () => void;
}): ReactNode {
  const t = useTranslations('onboarding');
  const update = useUpdateMe();
  const [locale, setLocale] = useState<Locale>(profile.locale);
  const options: readonly { value: Locale; label: string }[] = [
    { value: 'fr', label: 'Français' },
    { value: 'en', label: 'English' },
  ];
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        update.mutate({ ui_language: locale }, { onSuccess: onSaved });
      }}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">{t('language.label')}</legend>
        {options.map((option) => (
          <label
            key={option.value}
            className="border-field-line has-[:checked]:border-focus has-[:checked]:bg-panel flex min-h-14 cursor-pointer items-center gap-3 rounded-md border px-4 has-[:checked]:border-2"
          >
            <input
              type="radio"
              name="locale"
              value={option.value}
              checked={locale === option.value}
              onChange={() => {
                setLocale(option.value);
              }}
              className="accent-ink size-5"
            />
            <span className="font-semibold">{option.label}</span>
          </label>
        ))}
      </fieldset>
      <Actions pending={update.isPending} failed={update.isError} />
    </form>
  );
}

function Actions({
  pending,
  failed,
  label,
  skippable = false,
  onSkip,
}: {
  pending: boolean;
  failed: boolean;
  label?: string | undefined;
  skippable?: boolean;
  onSkip?: () => void;
}): ReactNode {
  const t = useTranslations('onboarding');
  const common = useTranslations('common');
  return (
    <div className="flex flex-col gap-3">
      {failed ? (
        <p role="alert" className="text-meta text-error font-semibold">
          {t('save_failed')}
        </p>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row-reverse">
        <Button type="submit" disabled={pending} className="w-full sm:w-auto">
          {pending ? t('saving') : (label ?? common('continue'))}
        </Button>
        {skippable ? (
          <Button type="button" variant="quiet" onClick={onSkip} className="w-full sm:w-auto">
            {common('later')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export interface OnboardingWorkspace {
  id: string;
  role: 'owner' | 'editor' | 'viewer';
}

/** Étape 4 : connexion Meta et bilan de santé. « Continuer » sauf si le compte publicitaire manque. */
function MetaStep({
  workspace,
  notice,
  onNext,
}: {
  workspace: OnboardingWorkspace;
  notice: ConnectNotice | null;
  onNext: () => void;
}): ReactNode {
  const t = useTranslations('onboarding');
  const common = useTranslations('common');
  const ready = useMetaReadiness(workspace.id);
  return (
    <div className="flex flex-col gap-5">
      <ConnectionPanel
        workspaceId={workspace.id}
        isOwner={workspace.role === 'owner'}
        variant="onboarding"
        notice={notice}
      />
      <div className="flex flex-col gap-3 sm:flex-row-reverse">
        <Button
          type="button"
          disabled={!ready.canContinue}
          onClick={onNext}
          className="w-full sm:w-auto"
        >
          {ready.hasWarnings ? t('meta.continue_anyway') : common('continue')}
        </Button>
        <Button type="button" variant="quiet" onClick={onNext} className="w-full sm:w-auto">
          {common('later')}
        </Button>
      </div>
    </div>
  );
}

/** Étape 5 : kit de marque de la Page active (couleurs, WhatsApp, ton des pubs). */
function BrandStep({
  workspace,
  onNext,
}: {
  workspace: OnboardingWorkspace;
  onNext: () => void;
}): ReactNode {
  const common = useTranslations('common');
  return (
    <div className="flex flex-col gap-5">
      <BrandKitPanel workspaceId={workspace.id} role={workspace.role} compact onSaved={onNext} />
      <Button
        type="button"
        variant="quiet"
        onClick={onNext}
        className="w-full sm:w-auto sm:self-start"
      >
        {common('later')}
      </Button>
    </div>
  );
}

/** Espace introuvable (ne devrait pas arriver) : on laisse passer l'étape. */
function LaterOnly({ onNext }: { onNext: () => void }): ReactNode {
  const common = useTranslations('common');
  return (
    <Button type="button" onClick={onNext} className="w-full sm:w-auto sm:self-start">
      {common('continue')}
    </Button>
  );
}

function TrialStep({ onNext }: { onNext: () => void }): ReactNode {
  const t = useTranslations('onboarding');
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        onNext();
      }}
    >
      <Actions pending={false} failed={false} label={t('trial.cta')} />
    </form>
  );
}

export function OnboardingFlow({
  step,
  countries,
  profile,
  workspace,
  notice,
}: {
  step: Step;
  countries: readonly CountryOption[];
  profile: OnboardingProfile;
  workspace: OnboardingWorkspace | null;
  /** Retour de Facebook (`?meta=`), lu par la page serveur. */
  notice: ConnectNotice | null;
}): ReactNode {
  const t = useTranslations('onboarding');
  const router = useRouter();
  const goNext = (): void => {
    router.push(nextPath(step));
  };
  const titleKey = (
    { pays: 'country', langue: 'language', essai: 'trial', meta: 'meta', marque: 'brand' } as const
  )[step];

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <Progress step={step} />
      <Card className="flex flex-col gap-5 sm:p-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold">{t(`${titleKey}.title`)}</h1>
          <p className="text-muted">{t(`${titleKey}.body`)}</p>
        </div>
        {step === 'pays' ? (
          <CountryStep countries={countries} profile={profile} onSaved={goNext} />
        ) : step === 'langue' ? (
          <LanguageStep profile={profile} onSaved={goNext} />
        ) : step === 'meta' && workspace !== null ? (
          <MetaStep workspace={workspace} notice={notice} onNext={goNext} />
        ) : step === 'marque' && workspace !== null ? (
          <BrandStep workspace={workspace} onNext={goNext} />
        ) : step === 'essai' ? (
          <TrialStep onNext={goNext} />
        ) : (
          <LaterOnly onNext={goNext} />
        )}
      </Card>
    </div>
  );
}
