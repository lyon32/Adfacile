'use client';
// Aperçu d'une pub dans un emplacement (PRD F3) : cadre, en-tête de la Page, texte, photo, bouton. Construit par Pubeka avec les
// jetons du design system (aucune couleur en dur). Les icônes sont décoratives. Le cadre garde les proportions de
// l'emplacement : la photo y est recadrée comme elle le sera (`object-cover`).
import { cn } from '@pubeka/ui';
import {
  Bookmark,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Send,
  Share2,
  ThumbsUp,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { clip, FRAME_RATIO, initialOf, VISIBLE_CHARS, type Placement } from './preview-model';
import { typographic } from './typography';

export interface AdPreviewProps {
  placement: Placement;
  pageName: string | null;
  primaryText: string;
  headline: string;
  description: string | null;
  /** Libellé du bouton, déjà traduit. */
  ctaLabel: string;
  /** Adresse signée de la photo ; `null` : emplacement réservé, la photo n'est pas disponible. */
  imageUrl: string | null;
}

function Avatar({ name, size = 'md' }: { name: string | null; size?: 'sm' | 'md' }): ReactNode {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'bg-ink text-bg flex shrink-0 items-center justify-center rounded-full font-bold',
        size === 'sm' ? 'size-7 text-xs' : 'size-9 text-sm',
      )}
    >
      {initialOf(name)}
    </span>
  );
}

function Photo({
  src,
  alt,
  ratio,
  className,
}: {
  src: string | null;
  alt: string;
  ratio: string;
  className?: string;
}): ReactNode {
  const t = useTranslations('campaign.wizard.preview');
  return src === null ? (
    <div
      role="img"
      aria-label={t('photo_missing')}
      style={{ aspectRatio: ratio }}
      className={cn(
        'bg-line text-meta text-muted flex w-full items-center justify-center p-4 text-center',
        className,
      )}
    >
      {t('photo_missing')}
    </div>
  ) : (
    // eslint-disable-next-line @next/next/no-img-element -- adresse signée du stockage privé : next/image n'optimise pas ce qu'il ne peut pas mettre en cache
    <img
      src={src}
      alt={alt}
      style={{ aspectRatio: ratio }}
      className={cn('w-full object-cover', className)}
      loading="lazy"
    />
  );
}

function Sponsored(): ReactNode {
  const t = useTranslations('campaign.wizard.preview');
  return <span className="text-meta text-muted">{t('sponsored')}</span>;
}

function CtaPill({ label, className }: { label: string; className?: string }): ReactNode {
  return (
    <span
      className={cn(
        'border-line inline-flex min-h-8 items-center rounded-md border px-3 text-sm font-semibold',
        className,
      )}
    >
      {label}
    </span>
  );
}

function FacebookFeed(props: AdPreviewProps): ReactNode {
  const t = useTranslations('campaign.wizard.preview');
  const locale = useLocale();
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 p-3">
        <Avatar name={props.pageName} />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold">
            {props.pageName ?? t('page_unknown')}
          </span>
          <Sponsored />
        </div>
        <MoreHorizontal aria-hidden="true" className="text-muted ml-auto size-5 shrink-0" />
      </div>
      <p className="px-3 pb-3 text-sm whitespace-pre-line">
        {typographic(props.primaryText, locale)}
      </p>
      <Photo src={props.imageUrl} alt={t('photo_alt')} ratio={FRAME_RATIO.facebook_feed} />
      <div className="bg-panel flex items-center justify-between gap-3 p-3">
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold">
            {typographic(props.headline, locale)}
          </span>
          {props.description === null || props.description === '' ? null : (
            <span className="text-meta text-muted truncate">
              {typographic(props.description, locale)}
            </span>
          )}
        </div>
        <CtaPill label={props.ctaLabel} className="shrink-0" />
      </div>
      <div className="border-line text-muted flex items-center justify-around border-t py-2 text-sm">
        <span className="flex items-center gap-1.5">
          <ThumbsUp aria-hidden="true" className="size-4" />
          {t('react_like')}
        </span>
        <span className="flex items-center gap-1.5">
          <MessageCircle aria-hidden="true" className="size-4" />
          {t('react_comment')}
        </span>
        <span className="flex items-center gap-1.5">
          <Share2 aria-hidden="true" className="size-4" />
          {t('react_share')}
        </span>
      </div>
    </div>
  );
}

function InstagramFeed(props: AdPreviewProps): ReactNode {
  const t = useTranslations('campaign.wizard.preview');
  const locale = useLocale();
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 p-3">
        <Avatar name={props.pageName} size="sm" />
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-sm font-semibold">
            {props.pageName ?? t('page_unknown')}
          </span>
          <Sponsored />
        </div>
        <MoreHorizontal aria-hidden="true" className="text-muted ml-auto size-5 shrink-0" />
      </div>
      <Photo src={props.imageUrl} alt={t('photo_alt')} ratio={FRAME_RATIO.instagram_feed} />
      <div className="bg-panel flex items-center justify-between px-3 py-2 text-sm font-semibold">
        <span>{props.ctaLabel}</span>
        <span aria-hidden="true">›</span>
      </div>
      <div className="text-ink flex items-center gap-4 px-3 pt-2">
        <Heart aria-hidden="true" className="size-5" />
        <MessageCircle aria-hidden="true" className="size-5" />
        <Send aria-hidden="true" className="size-5" />
        <Bookmark aria-hidden="true" className="ml-auto size-5" />
      </div>
      <p className="p-3 text-sm">
        <span className="font-semibold">{props.pageName ?? t('page_unknown')}</span>{' '}
        {typographic(clip(props.primaryText, VISIBLE_CHARS.instagram_feed), locale)}
      </p>
    </div>
  );
}

function Vertical({ props, reels }: { props: AdPreviewProps; reels: boolean }): ReactNode {
  const t = useTranslations('campaign.wizard.preview');
  const locale = useLocale();
  return (
    <div
      className="bg-obsidienne text-craie relative overflow-hidden"
      style={{ aspectRatio: reels ? FRAME_RATIO.reels : FRAME_RATIO.stories }}
    >
      <Photo
        src={props.imageUrl}
        alt={t('photo_alt')}
        ratio={reels ? FRAME_RATIO.reels : FRAME_RATIO.stories}
        className="absolute inset-0 h-full"
      />
      <div className="from-obsidienne/70 absolute inset-x-0 top-0 flex items-center gap-2 bg-gradient-to-b to-transparent p-3">
        <Avatar name={props.pageName} size="sm" />
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-sm font-semibold">
            {props.pageName ?? t('page_unknown')}
          </span>
          <span className="text-meta opacity-80">{t('sponsored')}</span>
        </div>
      </div>
      {reels ? (
        <div
          aria-hidden="true"
          className="absolute right-3 bottom-28 flex flex-col items-center gap-4"
        >
          <Heart className="size-6" />
          <MessageCircle className="size-6" />
          <Send className="size-6" />
        </div>
      ) : null}
      <div className="from-obsidienne/80 absolute inset-x-0 bottom-0 flex flex-col gap-3 bg-gradient-to-t to-transparent p-4 pt-12">
        <p className="text-sm font-semibold">{typographic(props.headline, locale)}</p>
        <p className="text-sm">
          {typographic(clip(props.primaryText, VISIBLE_CHARS[reels ? 'reels' : 'stories']), locale)}
        </p>
        <span className="bg-craie text-obsidienne inline-flex min-h-9 items-center justify-center self-start rounded-full px-4 text-sm font-semibold">
          {props.ctaLabel}
        </span>
      </div>
    </div>
  );
}

function Messenger(props: AdPreviewProps): ReactNode {
  const t = useTranslations('campaign.wizard.preview');
  const locale = useLocale();
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center gap-3">
        <Avatar name={props.pageName} />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold">
            {props.pageName ?? t('page_unknown')}
          </span>
          <Sponsored />
        </div>
      </div>
      <div className="border-line flex gap-3 rounded-lg border p-3">
        <div className="w-24 shrink-0 overflow-hidden rounded-md">
          <Photo src={props.imageUrl} alt={t('photo_alt')} ratio={FRAME_RATIO.messenger} />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-sm font-semibold">{typographic(props.headline, locale)}</span>
          <span className="text-meta text-muted">
            {typographic(clip(props.primaryText, VISIBLE_CHARS.messenger), locale)}
          </span>
          <CtaPill label={props.ctaLabel} className="mt-1 self-start" />
        </div>
      </div>
    </div>
  );
}

export function AdPreview(props: AdPreviewProps): ReactNode {
  const t = useTranslations('campaign.wizard.preview');
  const width =
    props.placement === 'stories' || props.placement === 'reels'
      ? 'max-w-[270px]'
      : 'max-w-[340px]';
  return (
    <article
      aria-label={t('frame_label', { placement: t(`tabs.${props.placement}`) })}
      className={cn('border-line bg-bg mx-auto w-full overflow-hidden rounded-xl border', width)}
    >
      {props.placement === 'facebook_feed' ? <FacebookFeed {...props} /> : null}
      {props.placement === 'instagram_feed' ? <InstagramFeed {...props} /> : null}
      {props.placement === 'stories' ? <Vertical props={props} reels={false} /> : null}
      {props.placement === 'reels' ? <Vertical props={props} reels /> : null}
      {props.placement === 'messenger' ? <Messenger {...props} /> : null}
    </article>
  );
}
