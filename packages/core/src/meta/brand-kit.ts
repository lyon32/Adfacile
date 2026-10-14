// Kit de marque d'une Page (F2) : logo, couleurs, police, numéros, slogan, ton. Réutilisé
// automatiquement par les visuels et les textes. Tout membre le lit ; le propriétaire et l'éditeur
// l'enregistrent (SECURITY_NOTES §2.3). Écriture avec le client de l'utilisateur : la RLS
// s'applique en plus de nos contrôles.
import { AppError } from '@pubeka/contracts';
import { check, one, unwrap, type Json } from '@pubeka/db';
import type { MemberCtx } from '../context';
import { assertRole, assertWritable } from '../workspaces/guards';

export const BRAND_TONES = ['premium', 'friendly', 'bold', 'serious', 'playful'] as const;
export type BrandTone = (typeof BRAND_TONES)[number];

export interface BrandColors {
  primary?: string | undefined;
  secondary?: string | undefined;
  accent?: string | undefined;
}

export interface BrandKitView {
  logo_path: string | null;
  colors: BrandColors;
  font: string | null;
  phone: string | null;
  whatsapp: string | null;
  tagline: string | null;
  tone: BrandTone | null;
  show_number_on_visuals: boolean;
}

/** Ce que le client envoie : les champs absents reviennent à vide. */
export type BrandKitInput = { [K in keyof BrandKitView]?: BrandKitView[K] | undefined };

export const EMPTY_BRAND_KIT: BrandKitView = {
  logo_path: null,
  colors: {},
  font: null,
  phone: null,
  whatsapp: null,
  tagline: null,
  tone: null,
  show_number_on_visuals: true,
};

interface BrandKitRow {
  logo_path: string | null;
  colors: Json;
  font: string | null;
  phone: string | null;
  whatsapp: string | null;
  tagline: string | null;
  tone: string | null;
  show_number_on_visuals: boolean;
}

const COLUMNS = 'logo_path, colors, font, phone, whatsapp, tagline, tone, show_number_on_visuals';
const HEX = /^#[0-9A-Fa-f]{6}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Couleurs lues en base : seules les trois clés connues, seulement si elles sont valides. */
function toColors(value: Json): BrandColors {
  if (!isRecord(value)) return {};
  const colors: BrandColors = {};
  for (const key of ['primary', 'secondary', 'accent'] as const) {
    const color = value[key];
    if (typeof color === 'string' && HEX.test(color)) colors[key] = color;
  }
  return colors;
}

function colorsToJson(colors: BrandColors): Record<string, string> {
  return {
    ...(colors.primary === undefined ? {} : { primary: colors.primary }),
    ...(colors.secondary === undefined ? {} : { secondary: colors.secondary }),
    ...(colors.accent === undefined ? {} : { accent: colors.accent }),
  };
}

function toView(row: BrandKitRow): BrandKitView {
  return {
    logo_path: row.logo_path,
    colors: toColors(row.colors),
    font: row.font,
    phone: row.phone,
    whatsapp: row.whatsapp,
    tagline: row.tagline,
    tone: BRAND_TONES.find((t) => t === row.tone) ?? null,
    show_number_on_visuals: row.show_number_on_visuals,
  };
}

async function assertPageInWorkspace(ctx: MemberCtx, pageId: string): Promise<void> {
  one<{ id: string }>(
    await ctx.db
      .from('pages')
      .select('id')
      .eq('workspace_id', ctx.workspace.id)
      .eq('id', pageId)
      .maybeSingle(),
  );
}

/** `GET {ws}/pages/{pageId}/brand-kit` : valeurs par défaut tant que rien n'est enregistré. */
export async function getBrandKit(ctx: MemberCtx, pageId: string): Promise<BrandKitView> {
  await assertPageInWorkspace(ctx, pageId);
  const row = unwrap<BrandKitRow | null>(
    await ctx.db
      .from('brand_kits')
      .select(COLUMNS)
      .eq('workspace_id', ctx.workspace.id)
      .eq('page_id', pageId)
      .maybeSingle(),
  );
  return row === null ? EMPTY_BRAND_KIT : toView(row);
}

/** Le logo doit être un fichier de CET espace dans le compartiment `brand` (`<workspace_id>/…`). */
export function assertLogoPath(workspaceId: string, path: string): void {
  const parts = path.split('/');
  const valid =
    path.length <= 300 &&
    /^[A-Za-z0-9._/-]+$/.test(path) &&
    path.startsWith(`${workspaceId}/`) &&
    parts.length >= 2 &&
    parts.every((part) => part !== '' && part !== '.' && part !== '..');
  if (!valid) {
    throw new AppError('validation_failed', {
      errors: [{ field: 'logo_path', code: 'invalid_format', message: 'Chemin de logo invalide' }],
    });
  }
}

/** `PUT {ws}/pages/{pageId}/brand-kit` : remplace le kit (les champs absents reviennent à vide). */
export async function putBrandKit(
  ctx: MemberCtx,
  pageId: string,
  input: BrandKitInput,
): Promise<BrandKitView> {
  assertRole(ctx, ['owner', 'editor']);
  assertWritable(ctx);
  await assertPageInWorkspace(ctx, pageId);
  const kit: BrandKitView = {
    logo_path: input.logo_path ?? null,
    colors: input.colors ?? {},
    font: input.font ?? null,
    phone: input.phone ?? null,
    whatsapp: input.whatsapp ?? null,
    tagline: input.tagline ?? null,
    tone: input.tone ?? null,
    show_number_on_visuals: input.show_number_on_visuals ?? true,
  };
  if (kit.logo_path !== null) assertLogoPath(ctx.workspace.id, kit.logo_path);
  check(
    await ctx.db.from('brand_kits').upsert(
      {
        page_id: pageId,
        workspace_id: ctx.workspace.id,
        logo_path: kit.logo_path,
        colors: colorsToJson(kit.colors),
        font: kit.font,
        phone: kit.phone,
        whatsapp: kit.whatsapp,
        tagline: kit.tagline,
        tone: kit.tone,
        show_number_on_visuals: kit.show_number_on_visuals,
        updated_at: ctx.now().toISOString(),
      },
      { onConflict: 'page_id' },
    ),
  );
  return getBrandKit(ctx, pageId);
}
