'use client';
// Réglages > Profil (APPFLOW §14) : nom, e-mail (lecture seule), téléphone, pays, ville, monnaie,
// langue, thème. Mêmes limites que PATCH /me (react-hook-form + Zod).
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Field } from '@pubeka/ui';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { LOCALE_COOKIE, THEME_COOKIE } from '@pubeka/i18n';
import { apiFetch } from '../../lib/api';
import type { CountryOption } from '../shell/countries';
import { writeCookie } from '../shell/use-update-me';
import { SelectField } from './select-field';

const PHONE = /^\+[1-9][0-9]{6,14}$/;

export const ProfileFormSchema = z.object({
  first_name: z.string().trim().max(80, 'name_too_long'),
  last_name: z.string().trim().max(80, 'name_too_long'),
  phone: z
    .string()
    .trim()
    .refine((value) => value === '' || PHONE.test(value), 'phone_invalid'),
  country_code: z.string().regex(/^[A-Z]{2}$/),
  city: z.string().trim().max(120),
  currency_display: z.enum(['XAF', 'XOF']),
  ui_language: z.enum(['fr', 'en']),
  theme: z.enum(['light', 'dark', 'system']),
});

export type ProfileFormValues = z.infer<typeof ProfileFormSchema>;

/** Corps de PATCH /me : le téléphone vide est omis (l'API n'accepte que le format international). */
export function toPatch(values: ProfileFormValues): Record<string, string> {
  const { phone, ...rest } = values;
  return phone === '' ? rest : { ...rest, phone };
}

const SavedMeSchema = z.looseObject({
  ui_language: z.enum(['fr', 'en']),
  theme: z.enum(['light', 'dark', 'system']),
});

export function ProfileForm({
  email,
  initial,
  countries,
}: {
  email: string;
  initial: ProfileFormValues;
  countries: readonly CountryOption[];
}): ReactNode {
  const t = useTranslations('settings');
  const p = useTranslations('settings.profile');
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(ProfileFormSchema),
    defaultValues: initial,
  });
  const { errors } = form.formState;

  const save = useMutation({
    mutationFn: (values: ProfileFormValues) =>
      apiFetch('/me', SavedMeSchema, { method: 'PATCH', body: toPatch(values) }),
    onSuccess: (me) => {
      writeCookie(LOCALE_COOKIE, me.ui_language);
      writeCookie(THEME_COOKIE, me.theme);
      setSaved(true);
      router.refresh();
    },
  });

  const message = (key: string | undefined): string | undefined =>
    key === 'phone_invalid'
      ? p('phone_invalid')
      : key === 'name_too_long'
        ? p('name_too_long')
        : undefined;

  return (
    <form
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        setSaved(false);
        void form.handleSubmit((values) => {
          save.mutate(values);
        })(event);
      }}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label={p('first_name')}
          autoComplete="given-name"
          error={message(errors.first_name?.message)}
          defaultValue={initial.first_name}
          {...form.register('first_name')}
        />
        <Field
          label={p('last_name')}
          autoComplete="family-name"
          error={message(errors.last_name?.message)}
          defaultValue={initial.last_name}
          {...form.register('last_name')}
        />
      </div>
      <Field label={p('email')} value={email} readOnly hint={p('email_hint')} />
      <Field
        label={p('phone')}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        hint={p('phone_hint')}
        error={message(errors.phone?.message)}
        defaultValue={initial.phone}
        {...form.register('phone')}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField
          label={p('country')}
          options={countries.map((c) => ({ value: c.code, label: c.name }))}
          defaultValue={initial.country_code}
          {...form.register('country_code', {
            onChange: (event: { target: { value: string } }) => {
              // La monnaie du pays est proposée d'office, modifiable ensuite.
              const found = countries.find((c) => c.code === event.target.value);
              if (found !== undefined) form.setValue('currency_display', found.currency);
            },
          })}
        />
        <Field
          label={p('city')}
          autoComplete="address-level2"
          defaultValue={initial.city}
          {...form.register('city')}
        />
      </div>
      <p className="text-meta text-muted -mt-3">{p('country_hint')}</p>
      <div className="grid gap-5 sm:grid-cols-3">
        <SelectField
          label={p('currency')}
          options={[
            { value: 'XAF', label: 'FCFA (XAF)' },
            { value: 'XOF', label: 'FCFA (XOF)' },
          ]}
          defaultValue={initial.currency_display}
          {...form.register('currency_display')}
        />
        <SelectField
          label={p('language')}
          options={[
            { value: 'fr', label: 'Français' },
            { value: 'en', label: 'English' },
          ]}
          defaultValue={initial.ui_language}
          {...form.register('ui_language')}
        />
        <SelectField
          label={p('theme')}
          options={[
            { value: 'light', label: p('theme_light') },
            { value: 'dark', label: p('theme_dark') },
            { value: 'system', label: p('theme_system') },
          ]}
          defaultValue={initial.theme}
          {...form.register('theme')}
        />
      </div>
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <Button type="submit" disabled={save.isPending} className="w-full sm:w-auto">
          {p('submit')}
        </Button>
        {save.isError ? (
          <p role="alert" className="text-meta text-error font-semibold">
            {t('save_failed')}
          </p>
        ) : null}
        {saved && !save.isError ? (
          <p role="status" className="text-meta text-muted font-semibold">
            {t('saved')}
          </p>
        ) : null}
      </div>
    </form>
  );
}
