// Ce que les écrans « Aperçu » et « Publier » demandent avant le clic (APPFLOW §8.5-8.6) : la photo (adresse signée valable
// 15 minutes, API_SPEC §13), la clause de responsabilité à accepter ou non, l'état de Meta, la Page, et le rayon réellement
// envoyé à Meta pour chaque ville. LECTURE SEULE : tout membre, même en lecture seule de l'espace ; rien n'est modifié.
import { AppError } from '@pubeka/contracts';
import { cityRadiusKm } from '@pubeka/platforms';
import type { MemberCtx } from '../../context';
import { geoSchema, readJson } from '../campaign-schemas';
import { loadPublishInputs } from './load-inputs';
import { loadPublishRow } from './publish-row';

export interface PublicationReadiness {
  liability_required: boolean;
  visual: {
    status: 'ready' | 'missing' | 'expired';
    url: string | null;
    expires_at: string | null;
  };
  meta: {
    connection: 'ok' | 'expiring' | 'expired' | 'revoked' | 'none';
    ad_account: { name: string | null; currency: string | null } | null;
    payment_method: 'present' | 'missing' | 'unknown';
  };
  page: { id: string; name: string | null; active: boolean } | null;
  cities: { name: string; radius_km: number; effective_radius_km: number }[];
}

/** Durée de l'adresse signée de la photo montrée à l'écran (API_SPEC §13 : 15 minutes). */
const VISUAL_URL_TTL_S = 900;

export async function getPublicationReadiness(
  ctx: MemberCtx,
  campaignId: string,
): Promise<PublicationReadiness> {
  const workspaceId = ctx.workspace.id;
  const row = await loadPublishRow(ctx.db, workspaceId, campaignId);
  const inputs = await loadPublishInputs(ctx.db, workspaceId, row, ctx.now());

  const accepted = await ctx.svc
    .from('publish_liability_acceptances')
    .select('workspace_id')
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (accepted.error !== null) throw new AppError('internal_error', { cause: accepted.error });

  let visual: PublicationReadiness['visual'] = { status: 'missing', url: null, expires_at: null };
  const source = inputs.visual;
  if (source !== null) {
    const expired = source.expiresAt !== null && source.expiresAt.getTime() <= ctx.now().getTime();
    visual = { status: 'expired', url: null, expires_at: null };
    if (!expired) {
      const signed = await ctx.svc.storage
        .from(source.bucket)
        .createSignedUrl(source.filePath, VISUAL_URL_TTL_S);
      // Fichier supprimé ou stockage en panne : la photo est dite indisponible, l'écran reste utilisable.
      if (signed.error === null) {
        visual = {
          status: 'ready',
          url: signed.data.signedUrl,
          expires_at: new Date(ctx.now().getTime() + VISUAL_URL_TTL_S * 1000).toISOString(),
        };
      }
    }
  }

  const geo = readJson(geoSchema, row.geo, {});
  return {
    liability_required: accepted.data === null,
    visual,
    meta: {
      connection: inputs.connection === null ? 'none' : inputs.connection.status,
      ad_account:
        inputs.adAccount === null
          ? null
          : { name: inputs.adAccount.name, currency: inputs.adAccount.currency },
      payment_method:
        inputs.adAccount?.hasPaymentMethod === true
          ? 'present'
          : inputs.adAccount?.hasPaymentMethod === false
            ? 'missing'
            : 'unknown',
    },
    page:
      inputs.page === null
        ? null
        : { id: inputs.page.id, name: inputs.page.name, active: inputs.page.active },
    cities: (geo.cities ?? []).map((city) => ({
      name: city.name,
      radius_km: city.radius_km,
      effective_radius_km: cityRadiusKm(city.radius_km),
    })),
  };
}
