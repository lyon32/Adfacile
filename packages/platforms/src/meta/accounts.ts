// Lectures sur le compte Meta du client : comptes publicitaires, Pages, ensembles de données (pixels),
// Instagram, WhatsApp, permissions. Portées de backend/src/services/facebookService.js, sans la base
// de données ni le chiffrement (qui sont l'affaire de `core`). Les réponses de Meta sont des données
// externes : chacune est lue par un schéma Zod, tolérant sur les champs inconnus.
// Documentation : https://developers.facebook.com/docs/marketing-api/reference/ad-account
import { z } from 'zod';
import type { PlatformAdAccount, PlatformPage } from '../types';
import { isTokenRevokedError, MetaGraphError, MetaOperationError } from './errors';
import type { GraphClient } from './graph';

const dataOf = <T extends z.ZodType>(item: T) => z.looseObject({ data: z.array(item).optional() });

export const actId = (adAccountId: string): string =>
  adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;

// ═══ Comptes publicitaires ══════════════════════════════════════════════════════════════════════════════════

/**
 * Statuts de compte publicitaire, en clair. Meta ne renvoie qu'un entier : sans traduction, l'interface
 * ne peut pas dire pourquoi un compte est inutilisable — et l'utilisateur choisit un compte désactivé,
 * sur lequel toute création de publicité est refusée.
 */
const AD_ACCOUNT_STATUS: Readonly<Record<number, { usable: boolean; label: string }>> = {
  1: { usable: true, label: 'Actif' },
  2: { usable: false, label: 'Désactivé' },
  3: { usable: false, label: 'Impayé' },
  7: { usable: false, label: 'En attente de vérification' },
  8: { usable: false, label: 'En attente de clôture' },
  9: { usable: true, label: 'En période de grâce' },
  100: { usable: false, label: 'Fermé définitivement' },
  101: { usable: false, label: 'Fermé' },
};

export function describeAdAccountStatus(status: number): { usable: boolean; label: string } {
  return Object.hasOwn(AD_ACCOUNT_STATUS, status)
    ? (AD_ACCOUNT_STATUS[status] ?? { usable: false, label: 'Statut inconnu' })
    : { usable: false, label: 'Statut inconnu' };
}

const adAccountSchema = z.looseObject({
  id: z.string(),
  name: z.string().optional(),
  account_status: z.number().optional(),
  currency: z.string().optional(),
  timezone_name: z.string().optional(),
});

/** Comptes publicitaires du jeton, avec statut en clair (sans le nombre de pixels). */
export async function getAdAccounts(
  graph: GraphClient,
  accessToken: string,
): Promise<PlatformAdAccount[]> {
  try {
    const raw = await graph.get('me/adaccounts', {
      fields: 'id,name,account_status,currency,timezone_name',
      access_token: accessToken,
    });
    return (dataOf(adAccountSchema).parse(raw).data ?? []).map((c) => {
      const statusCode = c.account_status ?? 0;
      const status = describeAdAccountStatus(statusCode);
      return {
        id: c.id,
        name: c.name ?? c.id,
        statusCode,
        statusLabel: status.label,
        usable: status.usable,
        currency: c.currency ?? null,
        timezone: c.timezone_name ?? null,
        pixelsCount: null,
      };
    });
  } catch (error) {
    throw new MetaOperationError('Impossible de récupérer les comptes publicitaires', error);
  }
}

// ═══ Pages ══════════════════════════════════════════════════════════════════════════════════════════════════

const pageSchema = z.looseObject({
  id: z.string(),
  name: z.string().optional(),
  category: z.string().optional(),
});

/** Page avec son jeton propre, lu comme AdFacile le lisait : il sert à chercher Instagram sur cette Page. */
export interface MetaPage extends PlatformPage {
  /** Jeton de la Page (secret : ne sort jamais du serveur, `listPages` du connecteur le retire). */
  accessToken: string | null;
}

/** Le jeton de la Page s'il existe, sinon celui de l'utilisateur (repli d'AdFacile). */
export function pageTokenOrUser(
  page: Pick<MetaPage, 'accessToken'> | undefined,
  userToken: string,
): string {
  return page?.accessToken ?? userToken;
}

/** Pages du jeton, avec leur jeton propre quand Meta le fournit. */
export async function getUserPages(graph: GraphClient, accessToken: string): Promise<MetaPage[]> {
  try {
    const raw = await graph.get('me/accounts', {
      fields: 'id,name,access_token,category,tasks',
      access_token: accessToken,
    });
    return (dataOf(pageSchema).parse(raw).data ?? []).map((p) => ({
      id: p.id,
      name: p.name ?? p.id,
      category: p.category ?? null,
      accessToken: typeof p.access_token === 'string' ? p.access_token : null,
    }));
  } catch (error) {
    throw new MetaOperationError('Impossible de récupérer les pages Facebook', error);
  }
}

// ═══ Ensembles de données (pixels) ══════════════════════════════════════════════════════════════════════════

export interface PixelSummary {
  id: string;
  name: string;
  last_fired_time: string | null;
}

const pixelSchema = z.looseObject({
  id: z.string(),
  name: z.string().optional(),
  is_unavailable: z.boolean().optional(),
  last_fired_time: z.string().optional(),
});

/**
 * `is_unavailable` écarte les pixels auxquels le compte n'a plus accès : les proposer reviendrait à
 * faire choisir un identifiant que Meta refusera.
 */
function formatPixels(list: z.infer<typeof pixelSchema>[] | undefined): PixelSummary[] {
  return (list ?? [])
    .filter((pixel) => !pixel.is_unavailable)
    .map((pixel) => ({
      id: pixel.id,
      name: pixel.name ?? `Pixel ${pixel.id}`,
      last_fired_time: pixel.last_fired_time ?? null,
    }));
}

/**
 * Ensembles de données (anciennement pixels) du compte publicitaire. Meta exige un pixel et un
 * évènement pour optimiser sur les achats d'un site : on les lit plutôt que de les faire saisir.
 */
export async function getAdAccountPixels(
  graph: GraphClient,
  adAccountId: string,
  accessToken: string,
): Promise<PixelSummary[]> {
  try {
    const raw = await graph.get(`${actId(adAccountId)}/adspixels`, {
      fields: 'id,name,is_unavailable,last_fired_time',
      access_token: accessToken,
    });
    return formatPixels(dataOf(pixelSchema).parse(raw).data);
  } catch (error) {
    throw new MetaOperationError(
      'Impossible de récupérer les ensembles de données du compte publicitaire',
      error,
    );
  }
}

/**
 * Ensembles de données que l'entreprise possède (`{entreprise}/owned_pixels`). Jamais bloquant : sans
 * entreprise, sans permission ou si Meta refuse, la liste est vide — l'écran retombe alors sur ce que
 * le compte a déjà.
 */
export async function getBusinessPixels(
  graph: GraphClient,
  businessId: string | null,
  accessToken: string,
): Promise<PixelSummary[]> {
  if (!businessId) return [];
  try {
    const raw = await graph.get(`${businessId}/owned_pixels`, {
      fields: 'id,name,is_unavailable,last_fired_time',
      access_token: accessToken,
    });
    return formatPixels(dataOf(pixelSchema).parse(raw).data);
  } catch {
    return [];
  }
}

const accountBusinessSchema = z.looseObject({
  business: z.looseObject({ id: z.string() }).optional(),
});

/**
 * Vue d'ensemble pour l'assistant : ce qui est rattaché au compte publicitaire (utilisable tout de suite)
 * et ce que l'entreprise possède sans l'avoir partagé avec ce compte (à partager, dans Meta, avant de
 * s'en servir).
 */
export async function getPixelsOverview(
  graph: GraphClient,
  adAccountId: string,
  accessToken: string,
  businessId: string | null = null,
): Promise<{ attached: PixelSummary[]; business_unattached: PixelSummary[] }> {
  const attached = await getAdAccountPixels(graph, adAccountId, accessToken);

  let entreprise = businessId;
  if (!entreprise) {
    try {
      const raw = await graph.get(actId(adAccountId), {
        fields: 'business{id}',
        access_token: accessToken,
      });
      entreprise = accountBusinessSchema.parse(raw).business?.id ?? null;
    } catch {
      entreprise = null;
    }
  }

  const dansEntreprise = await getBusinessPixels(graph, entreprise, accessToken);
  const rattaches = new Set(attached.map((p) => p.id));

  return { attached, business_unattached: dansEntreprise.filter((p) => !rattaches.has(p.id)) };
}

/** Comptes publicitaires avec leur nombre d'ensembles de données (null si le compte refuse la lecture). */
export async function listAdAccountsWithPixels(
  graph: GraphClient,
  accessToken: string,
): Promise<PlatformAdAccount[]> {
  const comptes = await getAdAccounts(graph, accessToken);
  return Promise.all(
    comptes.map(async (compte) => {
      try {
        return {
          ...compte,
          pixelsCount: (await getAdAccountPixels(graph, compte.id, accessToken)).length,
        };
      } catch {
        return { ...compte, pixelsCount: null };
      }
    }),
  );
}

// ═══ Instagram et WhatsApp ══════════════════════════════════════════════════════════════════════════════════

export interface InstagramAccount {
  id: string;
  username: string | null;
}

const instagramSchema = z.looseObject({
  instagram_business_account: z
    .looseObject({ id: z.string(), username: z.string().optional() })
    .optional(),
});

/** Compte Instagram professionnel lié à la Page, ou null (jamais d'exception : l'absence n'est pas une panne). */
export async function getConnectedInstagramAccount(
  graph: GraphClient,
  pageId: string,
  accessToken: string,
): Promise<InstagramAccount | null> {
  try {
    const raw = await graph.get(pageId, {
      fields: 'instagram_business_account{id,username,profile_picture_url,name,followers_count}',
      access_token: accessToken,
    });
    const ig = instagramSchema.parse(raw).instagram_business_account;
    return ig ? { id: ig.id, username: ig.username ?? null } : null;
  } catch {
    return null;
  }
}

export interface WhatsAppAccount {
  id: string;
  phoneNumber: string | null;
  verifiedName: string | null;
}

const whatsappSchema = z.looseObject({
  id: z.string(),
  phone_number: z.string().optional(),
  verified_name: z.string().optional(),
});
const pageWhatsappSchema = z.looseObject({ whatsapp_business_account: whatsappSchema.optional() });
const businessSchema = z.looseObject({ id: z.string(), name: z.string().optional() });

function whatsappOf(raw: z.infer<typeof whatsappSchema>): WhatsAppAccount {
  return {
    id: raw.id,
    phoneNumber: raw.phone_number ?? null,
    verifiedName: raw.verified_name ?? null,
  };
}

/** Compte WhatsApp Business des entreprises du jeton (WhatsApp est lié au Business Manager, pas à la Page). */
export async function getWhatsAppAccounts(
  graph: GraphClient,
  accessToken: string,
): Promise<WhatsAppAccount | null> {
  try {
    const businesses =
      dataOf(businessSchema).parse(
        await graph.get('me/businesses', { fields: 'id,name', access_token: accessToken }),
      ).data ?? [];

    for (const business of businesses) {
      for (const endpoint of [
        'owned_whatsapp_business_accounts',
        'client_whatsapp_business_accounts',
        'whatsapp_business_accounts',
      ]) {
        try {
          const raw = await graph.get(`${business.id}/${endpoint}`, {
            fields: 'id,name,phone_number,verified_name,account_review_status',
            access_token: accessToken,
          });
          const first = dataOf(whatsappSchema).parse(raw).data?.[0];
          if (first) return whatsappOf(first);
        } catch (error) {
          // Jeton invalide : inutile de continuer à chercher.
          if (error instanceof MetaGraphError && isTokenRevokedError(error.fbError)) return null;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** Compte WhatsApp Business lié à la Page ; à défaut, recherché via le Business Manager. */
export async function getConnectedWhatsAppAccount(
  graph: GraphClient,
  pageId: string,
  accessToken: string,
): Promise<WhatsAppAccount | null> {
  try {
    const raw = await graph.get(pageId, {
      fields: 'whatsapp_business_account{id,phone_number,verified_name}',
      access_token: accessToken,
    });
    const onPage = pageWhatsappSchema.parse(raw).whatsapp_business_account;
    return onPage ? whatsappOf(onPage) : await getWhatsAppAccounts(graph, accessToken);
  } catch {
    return getWhatsAppAccounts(graph, accessToken);
  }
}

// ═══ Permissions ════════════════════════════════════════════════════════════════════════════════════════════

const permissionSchema = z.looseObject({ permission: z.string(), status: z.string() });

/** Permissions accordées par l'utilisateur (`granted`) au jeton. */
export async function getGrantedPermissions(
  graph: GraphClient,
  accessToken: string,
): Promise<string[]> {
  try {
    const raw = await graph.get('me/permissions', { access_token: accessToken });
    return (dataOf(permissionSchema).parse(raw).data ?? [])
      .filter((p) => p.status === 'granted')
      .map((p) => p.permission);
  } catch (error) {
    throw new MetaOperationError('Impossible de récupérer les permissions Facebook', error);
  }
}
