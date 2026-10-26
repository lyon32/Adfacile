'use client';
// Kit de marque (F2, APPFLOW §5 étape 5 et §14) : couleurs, police, numéros, slogan, ton, et le
// ton des pubs (« tu » ou « vous ») qui est un réglage de la Page. Un kit par Page. Mêmes limites
// que `PUT …/brand-kit` (react-hook-form + Zod). Le logo se téléverse avec la route d'envoi de
// fichiers (S14) : d'ici là, un logo déjà enregistré est conservé tel quel.
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Card, Field, Switch } from '@pubeka/ui';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { SelectField } from '../settings/select-field';
import { useRenewalMessage, useWorkspaceWritable } from '../shell/use-writable';
import {
  BRAND_TONES,
  useBrandKit,
  usePages,
  usePutBrandKit,
  useUpdatePage,
  type BrandKit,
  type MetaPage,
} from './api';

const HEX = /^#[0-9A-Fa-f]{6}$/;
const PHONE = /^\+[1-9][0-9]{6,14}$/;
const color = z
  .string()
  .trim()
  .refine((v) => v === '' || HEX.test(v), 'color_invalid');
const phone = z
  .string()
  .trim()
  .refine((v) => v === '' || PHONE.test(v), 'phone_invalid');

export const BrandFormSchema = z.object({
  primary: color,
  secondary: color,
  accent: color,
  font: z.string().trim().max(60, 'too_long'),
  phone,
  whatsapp: phone,
  tagline: z.string().trim().max(120, 'too_long'),
  tone: z.enum(['', ...BRAND_TONES]),
  show_number_on_visuals: z.boolean(),
  ad_address: z.enum(['vous', 'tu']),
});
export type BrandFormValues = z.infer<typeof BrandFormSchema>;

const blank = (value: string): string | null => (value === '' ? null : value);

/** Corps de `PUT …/brand-kit` : le logo existant est conservé, les champs vides deviennent `null`. */
export function toBrandKit(values: BrandFormValues, current: BrandKit): BrandKit {
  return {
    logo_path: current.logo_path ?? null,
    colors: {
      ...(values.primary === '' ? {} : { primary: values.primary }),
      ...(values.secondary === '' ? {} : { secondary: values.secondary }),
      ...(values.accent === '' ? {} : { accent: values.accent }),
    },
    font: blank(values.font),
    phone: blank(values.phone),
    whatsapp: blank(values.whatsapp),
    tagline: blank(values.tagline),
    tone: values.tone === '' ? null : values.tone,
    show_number_on_visuals: values.show_number_on_visuals,
  };
}

export function toFormValues(kit: BrandKit, page: MetaPage): BrandFormValues {
  return {
    primary: kit.colors?.primary ?? '',
    secondary: kit.colors?.secondary ?? '',
    accent: kit.colors?.accent ?? '',
    font: kit.font ?? '',
    phone: kit.phone ?? '',
    whatsapp: kit.whatsapp ?? '',
    tagline: kit.tagline ?? '',
    tone: kit.tone ?? '',
    show_number_on_visuals: kit.show_number_on_visuals ?? true,
    ad_address: page.ad_address ?? 'vous',
  };
}

function Swatch({ value }: { value: string }): ReactNode {
  // La couleur de la marque du client (pas une couleur de Pubeka) : aperçu seulement.
  return HEX.test(value) ? (
    <span
      aria-hidden="true"
      className="border-line size-6 shrink-0 rounded-md border"
      style={{ backgroundColor: value }}
    />
  ) : null;
}

function Form({
  workspaceId,
  page,
  kit,
  compact,
  canEdit,
  onSaved,
}: {
  workspaceId: string;
  page: MetaPage;
  kit: BrandKit;
  compact: boolean;
  canEdit: boolean;
  onSaved?: (() => void) | undefined;
}): ReactNode {
  const t = useTranslations('meta.brand');
  const common = useTranslations('common');
  const writable = useWorkspaceWritable();
  const renewal = useRenewalMessage();
  const [saved, setSaved] = useState(false);
  const putKit = usePutBrandKit(workspaceId);
  const updatePage = useUpdatePage(workspaceId);
  const initial = toFormValues(kit, page);
  const form = useForm<BrandFormValues>({
    resolver: zodResolver(BrandFormSchema),
    defaultValues: initial,
  });
  const { errors } = form.formState;
  const pending = putKit.isPending || updatePage.isPending;
  const failed = putKit.isError || updatePage.isError;

  const message = (key: string | undefined): string | undefined =>
    key === 'color_invalid' || key === 'phone_invalid' || key === 'too_long'
      ? t(`errors.${key}`)
      : undefined;

  const submit = form.handleSubmit(async (values) => {
    setSaved(false);
    try {
      await putKit.mutateAsync({ pageId: page.id, kit: toBrandKit(values, kit) });
      if (values.ad_address !== (page.ad_address ?? 'vous')) {
        await updatePage.mutateAsync({ pageId: page.id, patch: { ad_address: values.ad_address } });
      }
      setSaved(true);
      onSaved?.();
    } catch {
      // L'erreur est affichée par l'état des mutations (putKit.isError, updatePage.isError).
    }
  });

  const colors = useWatch({ control: form.control, name: ['primary', 'secondary', 'accent'] });

  return (
    <form
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <fieldset disabled={!canEdit || pending} className="flex flex-col gap-6">
        <section aria-labelledby="brand-colors" className="flex flex-col gap-3">
          <h3 id="brand-colors" className="text-title font-semibold">
            {t('colors')}
          </h3>
          <div className="grid gap-5 sm:grid-cols-3">
            {(['primary', 'secondary', 'accent'] as const).map((name, index) => (
              <div key={name} className="flex items-start gap-3">
                <Field
                  className="min-w-0 flex-1"
                  label={t(`color_${name}`)}
                  maxLength={7}
                  autoCapitalize="characters"
                  spellCheck={false}
                  error={message(errors[name]?.message)}
                  defaultValue={initial[name]}
                  {...form.register(name)}
                />
                <span className="mt-3 flex h-6 items-center">
                  <Swatch value={colors[index] ?? ''} />
                </span>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="brand-contact" className="flex flex-col gap-3">
          <h3 id="brand-contact" className="text-title font-semibold">
            {t('numbers')}
          </h3>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label={t('whatsapp')}
              type="tel"
              inputMode="tel"
              hint={t('number_hint')}
              error={message(errors.whatsapp?.message)}
              defaultValue={initial.whatsapp}
              {...form.register('whatsapp')}
            />
            {compact ? null : (
              <Field
                label={t('phone')}
                type="tel"
                inputMode="tel"
                error={message(errors.phone?.message)}
                defaultValue={initial.phone}
                {...form.register('phone')}
              />
            )}
          </div>
          {compact ? null : (
            <div className="flex items-center justify-between gap-4">
              <label htmlFor="brand-show-number" className="min-w-0">
                <span className="block font-semibold">{t('show_number')}</span>
                <span className="text-meta text-muted block">{t('show_number_hint')}</span>
              </label>
              <Controller
                control={form.control}
                name="show_number_on_visuals"
                render={({ field }) => (
                  <Switch
                    id="brand-show-number"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
            </div>
          )}
        </section>

        <section aria-labelledby="brand-voice" className="flex flex-col gap-3">
          <h3 id="brand-voice" className="text-title font-semibold">
            {t('voice')}
          </h3>
          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField
              label={t('ad_address')}
              options={[
                { value: 'vous', label: t('address_vous') },
                { value: 'tu', label: t('address_tu') },
              ]}
              defaultValue={initial.ad_address}
              {...form.register('ad_address')}
            />
            {compact ? null : (
              <SelectField
                label={t('tone')}
                placeholder={t('tone_none')}
                options={BRAND_TONES.map((tone) => ({ value: tone, label: t(`tones.${tone}`) }))}
                defaultValue={initial.tone}
                {...form.register('tone')}
              />
            )}
          </div>
          {compact ? null : (
            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                label={t('tagline')}
                error={message(errors.tagline?.message)}
                defaultValue={initial.tagline}
                {...form.register('tagline')}
              />
              <Field
                label={t('font')}
                error={message(errors.font?.message)}
                defaultValue={initial.font}
                {...form.register('font')}
              />
            </div>
          )}
        </section>

        <section aria-labelledby="brand-logo" className="flex flex-col gap-1">
          <h3 id="brand-logo" className="text-title font-semibold">
            {t('logo')}
          </h3>
          <p className="text-meta text-muted">
            {kit.logo_path !== null && kit.logo_path !== undefined && kit.logo_path !== ''
              ? t('logo_saved')
              : t('logo_soon')}
          </p>
        </section>
      </fieldset>

      {canEdit ? (
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <Button type="submit" disabled={pending} className="w-full sm:w-auto">
            {pending ? t('saving') : compact ? common('continue') : t('submit')}
          </Button>
          {failed ? (
            <p role="alert" className="text-meta text-error font-semibold">
              {t('save_failed')}
            </p>
          ) : null}
          {saved && !failed ? (
            <p role="status" className="text-meta text-muted font-semibold">
              {common('saved')}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-meta text-muted">
          {writable ? t('read_only') : renewal ? t('renew_to_edit') : t('admin_read_only')}
        </p>
      )}
    </form>
  );
}

export interface BrandKitFormProps {
  workspaceId: string;
  role: 'owner' | 'editor' | 'viewer';
  /** Première configuration : couleurs, WhatsApp et ton des pubs seulement. */
  compact?: boolean;
  onSaved?: () => void;
}

export function BrandKitPanel({
  workspaceId,
  role,
  compact = false,
  onSaved,
}: BrandKitFormProps): ReactNode {
  const t = useTranslations('meta.brand');
  const writable = useWorkspaceWritable();
  const pages = usePages(workspaceId);
  const [picked, setPicked] = useState<string | null>(null);
  const active = pages.data?.data.filter((p) => p.active) ?? [];
  const page = active.find((p) => p.id === picked) ?? active[0];
  const kit = useBrandKit(workspaceId, page?.id ?? null);

  if (pages.isPending) return <p className="text-muted">{t('loading')}</p>;
  if (pages.isError) {
    return (
      <p role="alert" className="text-error font-semibold">
        {t('load_failed')}
      </p>
    );
  }
  if (page === undefined) {
    return (
      <Card className="flex flex-col gap-3">
        <p className="text-title font-semibold">{t('no_page_title')}</p>
        <p className="text-muted">{t('no_page_body')}</p>
        <Button asChild className="w-full sm:w-auto sm:self-start">
          <Link href="/reglages/comptes-meta">{t('no_page_cta')}</Link>
        </Button>
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      {active.length > 1 ? (
        <SelectField
          label={t('page')}
          value={page.id}
          options={active.map((p) => ({ value: p.id, label: p.name }))}
          onChange={(event) => {
            setPicked(event.target.value);
          }}
        />
      ) : (
        <p className="text-meta text-muted font-semibold">{t('for_page', { name: page.name })}</p>
      )}
      {kit.isPending ? <p className="text-muted">{t('loading')}</p> : null}
      {kit.isError ? (
        <p role="alert" className="text-error font-semibold">
          {t('load_failed')}
        </p>
      ) : null}
      {kit.data === undefined ? null : (
        <Form
          key={page.id}
          workspaceId={workspaceId}
          page={page}
          kit={kit.data}
          compact={compact}
          canEdit={role !== 'viewer' && writable}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}
