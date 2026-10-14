// Destination de la campagne : le triplet destination / optimisation / bouton, l'objet promu et les
// identités (Instagram, appel). Porté de backend/src/services/facebookAdsService.js, règles inchangées.
//
// Meta refuse toute publicité dont le bouton ne correspond pas à la destination de son ensemble
// (erreur #1815675). Faire ce choix ici, en un seul endroit, garantit que l'ensemble de publicités et la
// création ne peuvent pas diverger.
import type { MetaPageContext, PublishSpec } from '../types';
import { validateCombination, getDefaultGoal, toApiDestination } from './campaign-objectives';
import { MetaValidationError } from './errors';
import {
  buildMessagingDestination,
  isMessagingDestination,
  firstFilled,
  normalizeWhatsAppNumber,
  validateMessagingApps,
  type MessagingDestination,
} from './messaging-destinations';
import { getOptimizationGoal } from './targeting';

export interface Conversion {
  pixel_id: string;
  custom_event_type: string;
}

export interface PromotedObject {
  page_id?: string;
  whats_app_business_phone_number_id?: string;
  whatsapp_phone_number?: string;
  pixel_id?: string;
  custom_event_type?: string;
}

/** Ce que la résolution de la destination lit de la demande de publication. */
export type DestinationInput = Pick<
  Partial<PublishSpec>,
  | 'objective'
  | 'destinationType'
  | 'optimizationGoal'
  | 'messagingDestinations'
  | 'whatsappPhoneNumber'
  | 'whatsappPhoneNumberId'
  | 'pixelId'
  | 'customEventType'
>;

export interface StandardDestination {
  isMessaging: false;
  destination_type: string;
  optimization_goal: string;
  conversion: Conversion | null;
}

export interface ResolvedMessagingDestination extends MessagingDestination {
  isMessaging: true;
  whatsapp_phone_number: string | null;
  whatsapp_phone_number_id: string | null;
}

export type ResolvedDestination = StandardDestination | ResolvedMessagingDestination;

type PageForPromotion = Pick<MetaPageContext, 'id'> &
  Partial<Pick<MetaPageContext, 'whatsappNumber' | 'whatsappPhoneNumberId'>>;

/** Construit le promoted_object selon le type de destination. */
export function buildPromotedObject(
  destinationType: string,
  page: PageForPromotion,
  whatsappNumber: string | null = null,
  whatsappNumberId: string | null = null,
  conversion: Conversion | null = null,
): PromotedObject | undefined {
  if (isMessagingDestination(destinationType) || destinationType === 'INSTAGRAM_PROFILE') {
    const promoted: PromotedObject = { page_id: page.id };

    // Une Page peut relier jusqu'à cinquante numéros WhatsApp : sans désignation explicite, Meta n'en
    // promeut aucun et le sélecteur de numéro reste vide au niveau de la publicité.
    //
    // L'identifiant est préféré au numéro : Meta le rattache au compte WhatsApp Business, et en déduit
    // lui-même le numéro. Le numéro seul est accepté mais reste une chaîne, sans lien vers le compte.
    //
    // Les deux ensemble sont refusés — « (#200) Permissions error » — donc ce choix est exclusif.
    const id = (firstFilled(whatsappNumberId, page.whatsappPhoneNumberId) ?? '').trim();
    const numero = normalizeWhatsAppNumber(firstFilled(whatsappNumber, page.whatsappNumber));

    if (/^\d+$/.test(id)) {
      promoted.whats_app_business_phone_number_id = id;
    } else if (numero) {
      promoted.whatsapp_phone_number = numero;
    }
    return promoted;
  }

  // Site web : Meta exige l'ensemble de données (anciennement pixel) et l'évènement à optimiser dès que
  // l'on optimise sur les conversions — le Gestionnaire de publicités le marque d'une astérisque et
  // refuse de publier sans lui.
  if (conversion?.pixel_id) {
    return {
      pixel_id: conversion.pixel_id,
      custom_event_type: conversion.custom_event_type || 'PURCHASE',
    };
  }

  // Sans pixel, on ne fabrique rien : validateCombination() dira lui-même ce qui manque, dans les
  // termes de l'utilisateur.
  return undefined;
}

/** Refuse une combinaison que Meta rejetterait, avant tout appel réseau. */
function assertCombinaisonValide(input: Parameters<typeof validateCombination>[0]): void {
  const verdict = validateCombination(input);
  if (verdict.valid) return;
  throw new MetaValidationError(verdict.errors.join(' '), verdict.errors);
}

/** Compte Instagram à déclarer sur la création publicitaire (`object_story_spec.instagram_user_id`). */
export function instagramIdentity(
  destinationType: string | undefined,
  page: Pick<MetaPageContext, 'instagramAccountId'>,
): { instagram_user_id?: string } {
  // Une publicité « Instagram ou Facebook » (INSTAGRAM_PROFILE) doit être associée à un compte
  // Instagram : sans lui, Meta refuse la publicité (sous-code 3907008), relevé réel du 8 oct. 2026. Le
  // champ est `object_story_spec.instagram_user_id`, qui remplace instagram_actor_id (déprécié en
  // v22.0, retiré le 9 sept. 2025).
  if (destinationType !== 'INSTAGRAM_PROFILE') return {};

  const id = (page.instagramAccountId ?? '').trim();
  if (!id) {
    throw new MetaValidationError(
      "Aucun compte Instagram n'est relié à votre Page Facebook. Reliez-en un " +
        '(Paramètres de la Page → Comptes liés) puis reconnectez Facebook, ou ' +
        'choisissez une autre destination.',
    );
  }
  return { instagram_user_id: id };
}

/**
 * Bouton d'une publicité « Appels » (destination PHONE_CALL). Meta exige CALL_NOW avec un lien
 * `tel:+<indicatif><numéro>` (doc « Call Ads »). Relevé réel du 8 oct. 2026 : faute de numéro, la
 * publicité partait avec « En savoir plus » vers le site — personne ne pouvait appeler.
 */
export function phoneCallToAction(telephone: string | undefined): {
  type: 'CALL_NOW';
  value: { link: string };
} {
  const brut = (telephone ?? '').trim();
  if (!brut) throw new MetaValidationError('Indiquez le numéro de téléphone à appeler.');

  const chiffres = brut.replace(/[^\d+]/g, '');
  if (!/^\+\d{8,15}$/.test(chiffres)) {
    throw new MetaValidationError(
      'Le numéro doit commencer par l’indicatif pays, par exemple +237 6 99 00 00 00.',
    );
  }

  return { type: 'CALL_NOW', value: { link: `tel:${chiffres}` } };
}

/** Détermine, à partir de la demande, le triplet destination / optimisation / bouton. */
export function resolveDestination(
  input: DestinationInput,
  page: MetaPageContext,
): ResolvedDestination {
  // Nouveau format : cases à cocher multiples ; ancien format : un destination_type unique de messagerie.
  let apps: readonly string[] | undefined = input.messagingDestinations;
  if (!apps && isMessagingDestination(input.destinationType) && input.destinationType) {
    apps = [input.destinationType];
  }

  if (!apps || apps.length === 0) {
    // La carte d'interface peut couvrir plusieurs valeurs API : on envoie celle que l'objectif accepte
    // (« Votre publication » → ON_AD en Trafic).
    const destinationType =
      toApiDestination(input.objective, input.destinationType ?? 'WEBSITE') ?? 'WEBSITE';

    // L'objectif de performance venu du formulaire n'était repris que sur parole. Il survivait
    // notamment à un changement d'objectif : passer de Trafic à Notoriété conservait
    // LANDING_PAGE_VIEWS, que Meta refuse pour Notoriété — après avoir créé la campagne.
    const goal =
      firstFilled(input.optimizationGoal) ??
      getDefaultGoal(input.objective ?? '', destinationType) ??
      getOptimizationGoal(input.objective);

    const conversion: Conversion | null = input.pixelId
      ? { pixel_id: input.pixelId, custom_event_type: input.customEventType ?? 'PURCHASE' }
      : null;

    assertCombinaisonValide({
      objective: input.objective,
      goal,
      destination: destinationType,
      promotedObject: { ...buildPromotedObject(destinationType, page, null, null, conversion) },
    });

    return {
      isMessaging: false,
      destination_type: destinationType,
      optimization_goal: goal,
      conversion,
    };
  }

  // Vérifier le rattachement AVANT d'appeler Meta : un compte Instagram ou un numéro WhatsApp non
  // relié produit un rejet à la relecture, donc après que la campagne a déjà été créée.
  const validation = validateMessagingApps(
    apps,
    {
      pageId: page.id,
      instagramConnected: page.instagramConnected,
      whatsappConnected: page.whatsappConnected,
      whatsappNumber: page.whatsappNumber,
      whatsappPhoneNumberId: page.whatsappPhoneNumberId,
    },
    {
      whatsappPhoneNumber: input.whatsappPhoneNumber,
      whatsappPhoneNumberId: input.whatsappPhoneNumberId,
    },
  );
  if (!validation.valid) {
    throw new MetaValidationError(validation.errors.join(' '), validation.errors);
  }

  return {
    isMessaging: true,
    whatsapp_phone_number: normalizeWhatsAppNumber(
      firstFilled(input.whatsappPhoneNumber, page.whatsappNumber),
    ),
    whatsapp_phone_number_id:
      firstFilled(input.whatsappPhoneNumberId, page.whatsappPhoneNumberId) ?? null,
    ...buildMessagingDestination(apps),
  };
}
