// De la campagne enregistrée en base à ce que le connecteur envoie à Meta (`PublishSpec`). Fonction pure : tout vient de la base
// (jamais du navigateur), rien n'est inventé. Les règles propres à Meta (combinaison objectif / destination / bouton, minimum de
// budget, médias) sont ensuite vérifiées par le connecteur AVANT son premier appel.
//
// Choix documentés (voir le rapport de S16) :
//  - le ciblage est automatique (Advantage+) : pas d'intérêts, âge et genre de la proposition ;
//  - l'image de la pub est la photo téléversée (S23 apportera les visuels) ;
//  - le pixel n'est transmis que pour une optimisation sur les conversions (Ventes) : sur Trafic ou Messages, un
//    `promoted_object` avec pixel serait refusé ou inutile ;
//  - une destination `APP` ou `ON_POST` n'a pas les données nécessaires (lien d'application, publication existante) : refusée.
import { AppError, type FieldError } from '@pubeka/contracts';
import type { AccountCurrency, PublishSpec, TargetingLocation } from '@pubeka/platforms';
import type { AdCopy, Geo, Targeting, Tracking } from '../campaign-schemas';
import type { AdAccountInfo, PageInfo } from './load-inputs';

export interface SpecCampaign {
  name: string;
  objective: string | null;
  destination: string | null;
  optimization_goal: string | null;
  geo: Geo;
  targeting: Targeting;
  daily_budget_usd_cents: number | null;
  start_date: string | null;
  end_date: string | null;
  copy: AdCopy;
  tracking: Tracking;
}

export interface SpecInput {
  campaign: SpecCampaign;
  /** Référence de rapprochement `pk-…-N`, placée dans le nom de la campagne chez Meta. */
  ref: string;
  page: PageInfo;
  adAccount: AdAccountInfo;
  account: AccountCurrency;
  /** Adresse du site de la fiche du commerce. */
  website: string | null;
  /** Adresse signée de la photo (courte durée), sur le stockage de Pubeka. */
  mediaUrl: string;
  locations: TargetingLocation[];
}

const MESSAGING_APPS: Readonly<Record<string, string>> = {
  WHATSAPP: 'whatsapp',
  MESSENGER: 'messenger',
  INSTAGRAM_DIRECT: 'instagram',
};
const MAX_NAME = 255;

function invalid(field: string, code: string, message: string): AppError {
  const errors: FieldError[] = [{ field, code, message }];
  return new AppError('validation_failed', { errors });
}

function required<T>(value: T | null | undefined, field: string, message: string): T {
  if (value === null || value === undefined) throw invalid(field, 'required', message);
  return value;
}

function nonEmpty(value: string | undefined, field: string, message: string): string {
  if (value === undefined || value.trim() === '') throw invalid(field, 'required', message);
  return value;
}

/** Nom chez Meta : le nom du client, puis la référence. Le nom est raccourci pour que la référence tienne toujours. */
function metaName(name: string, ref: string): string {
  const suffix = ` [${ref}]`;
  return `${name.slice(0, MAX_NAME - suffix.length)}${suffix}`;
}

export function buildPublishSpec(input: SpecInput): PublishSpec {
  const { campaign, page, adAccount } = input;
  const objective = required(campaign.objective, 'objective', 'Choisis un objectif.');
  const destination = required(
    campaign.destination,
    'destination',
    'Choisis où mener les personnes.',
  );
  const dailyBudgetUsdCents = required(
    campaign.daily_budget_usd_cents,
    'daily_budget_usd_cents',
    'Indique un budget par jour.',
  );
  const startDate = required(campaign.start_date, 'start_date', 'Indique une date de début.');
  const endDate = required(campaign.end_date, 'end_date', 'Indique une date de fin.');
  const message = nonEmpty(
    campaign.copy.primary_text,
    'copy.primary_text',
    'Le texte de la pub est obligatoire.',
  );
  if (input.locations.length === 0)
    throw invalid('geo', 'required', 'Indique au moins un pays ou une ville.');

  const app = Object.hasOwn(MESSAGING_APPS, destination) ? MESSAGING_APPS[destination] : undefined;
  let destinationFields: Pick<
    PublishSpec,
    'destinationType' | 'messagingDestinations' | 'websiteUrl'
  > = {};
  let link: string | undefined;
  if (app !== undefined) {
    destinationFields = { messagingDestinations: [app] };
  } else if (destination === 'WEBSITE') {
    link = required(input.website, 'website_url', 'Ajoute l’adresse de ton site : la pub y mène.');
    destinationFields = { destinationType: 'WEBSITE', websiteUrl: link };
  } else if (destination === 'NONE') {
    // Notoriété : pas de destination ; Meta exige quand même un lien, celui de la Page.
    link = `https://www.facebook.com/${page.metaPageId}`;
    destinationFields = { destinationType: 'UNDEFINED' };
  } else {
    throw invalid(
      'destination',
      'unsupported',
      'Cette destination n’est pas encore disponible à la publication.',
    );
  }
  const headline = campaign.copy.headline ?? '';
  if (app === undefined) nonEmpty(headline, 'copy.headline', 'Le titre de la pub est obligatoire.');

  const goal = campaign.optimization_goal ?? undefined;
  const pixelId = goal === 'OFFSITE_CONVERSIONS' ? campaign.tracking?.pixel_id : undefined;
  const gender = campaign.targeting.genders;

  return {
    campaignName: metaName(campaign.name, input.ref),
    objective,
    adAccountId: adAccount.metaAdAccountId,
    account: input.account,
    page: {
      id: page.metaPageId,
      name: page.name,
      instagramAccountId: page.instagramAccountId,
      instagramConnected: page.instagramAccountId !== null,
      whatsappConnected: page.whatsappLinked,
      whatsappNumber: page.whatsappNumber,
      whatsappPhoneNumberId: null,
    },
    ...destinationFields,
    ...(goal === undefined ? {} : { optimizationGoal: goal }),
    ...(pixelId === undefined ? {} : { pixelId }),
    dailyBudgetUsdCents,
    startDate,
    endDate,
    targeting: {
      ...(campaign.targeting.age_min === undefined ? {} : { ageMin: campaign.targeting.age_min }),
      ...(campaign.targeting.age_max === undefined ? {} : { ageMax: campaign.targeting.age_max }),
      locations: input.locations,
      ...(gender === 'male' || gender === 'female' ? { genders: [gender] } : {}),
      // Ciblage automatique par défaut (décision du 16/10/2026) ; seul un refus explicite le coupe.
      advantageAudience: campaign.targeting.advantage_plus === false ? 0 : 1,
    },
    creative: {
      mediaType: 'image',
      mediaUrl: input.mediaUrl,
      message,
      headline,
      ...(campaign.copy.description === undefined || campaign.copy.description === null
        ? {}
        : { description: campaign.copy.description }),
      ...(link === undefined ? {} : { link }),
      ...(destination === 'WEBSITE' && campaign.copy.cta !== undefined
        ? { callToAction: campaign.copy.cta }
        : {}),
    },
  };
}
