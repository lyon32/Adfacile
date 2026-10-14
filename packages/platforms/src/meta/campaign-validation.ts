// Validation d'une campagne avant tout appel à Meta.
// Porté de `validateCampaignData` (backend/src/controllers/campaignController.js), règles inchangées.
// Les erreurs sont des phrases affichables ; `core` les convertit en `validation_failed`.
import { toAppError, MetaValidationError } from './errors';
import { FB_MIN_DAILY_BUDGET_CENTS, minDailyBudgetFcfa } from './currency';
import { checkMediaItems } from './media-specs';
import { isMessagingDestination, normalizeApps } from './messaging-destinations';
import type { PublishSpec } from '../types';
import type { AppError } from '@pubeka/contracts';

export interface ValidationOptions {
  /** Taux FCFA pour 1 $, pour exprimer le minimum de budget dans la monnaie de l'utilisateur. */
  xafPerUsd: number;
}

export function validateCampaignData(
  data: PublishSpec,
  options: ValidationOptions,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Niveau campagne
  if (!data.objective) errors.push("L'objectif est requis");
  if (data.campaignName.trim().length === 0) errors.push('Le nom de la campagne est requis');
  if (data.campaignName.length > 255) {
    errors.push('Le nom de la campagne ne doit pas dépasser 255 caractères');
  }

  // Niveau ensemble de publicités
  if (data.targeting.locations.length === 0) errors.push('Au moins une localisation est requise');
  const { ageMin, ageMax } = data.targeting;
  if (ageMin && (ageMin < 18 || ageMin > 65)) errors.push("L'âge minimum doit être entre 18 et 65");
  if (ageMax && (ageMax < 18 || ageMax > 65)) errors.push("L'âge maximum doit être entre 18 et 65");
  // Chaque borne était vérifiée isolément : un minimum de 60 avec un maximum de 20 passait, et
  // produisait une audience vide.
  if (ageMin && ageMax && ageMin > ageMax) {
    errors.push("L'âge minimum ne peut pas dépasser l'âge maximum");
  }

  // Le seuil suit le minimum réellement appliqué par le connecteur (1 $, TR-PLA-10), exprimé en FCFA.
  if (!data.dailyBudgetUsdCents || data.dailyBudgetUsdCents < FB_MIN_DAILY_BUDGET_CENTS) {
    errors.push(
      `Le budget minimum est de ${String(minDailyBudgetFcfa(options.xafPerUsd))} FCFA par jour`,
    );
  }

  // Calendrier
  if (data.startDate && data.endDate && new Date(data.endDate) <= new Date(data.startDate)) {
    errors.push('La date de fin doit être postérieure à la date de début');
  }

  // Meta exige une date de fin avec un budget total : sans elle, le service échoue après avoir créé
  // la campagne.
  if (data.budgetType === 'lifetime' && !data.endDate) {
    errors.push('Un budget total demande une date de fin');
  }

  // Une publicité qui ouvre une conversation n'a pas d'URL de destination : c'est Facebook qui
  // redirige vers Messenger, Instagram ou WhatsApp.
  const goesToMessaging =
    normalizeApps(data.messagingDestinations).length > 0 ||
    isMessagingDestination(data.destinationType);

  // Niveau publicité
  const creative = data.creative;
  if (!creative.message || creative.message.trim().length === 0) {
    errors.push('Le texte de la publicité est requis');
  }
  if (!goesToMessaging && (!creative.headline || creative.headline.trim().length === 0)) {
    errors.push('Le titre est requis');
  }
  if (!goesToMessaging && !creative.link) errors.push("L'URL de destination est requise");

  // Médias : refuser avant de créer quoi que ce soit chez Meta.
  if (creative.mediaType === 'video' && !creative.mediaUrl) {
    errors.push('Ajoutez une vidéo pour cette publicité');
  }
  errors.push(...checkMediaItems(creative.mediaType, creative.mediaItems));

  return { valid: errors.length === 0, errors };
}

/** Même contrôle, qui lève `validation_failed` (avec une entrée par message) si la campagne est invalide. */
export function assertValidCampaign(data: PublishSpec, options: ValidationOptions): void {
  const { valid, errors } = validateCampaignData(data, options);
  if (!valid) {
    const error: AppError = toAppError(
      new MetaValidationError('Données de campagne invalides', errors),
    );
    throw error;
  }
}
