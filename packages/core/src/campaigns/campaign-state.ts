// Machine d'état des campagnes : UNE seule porte d'entrée pour changer le statut (LLD §6.8, APPFLOW §11.2).
// Fonction pure (état, événement) → état ou erreur typée. La base répète la même table dans le déclencheur
// `private.guard_campaign_status` (migration 0010) : deux barrières indépendantes ; un test compare les deux.
//
// Les statuts de publication et de diffusion sont posés par S16 et S17 ; la table est complète dès S15 pour qu'il n'y ait
// jamais deux endroits où l'on décide d'une transition.
//
// Décisions de la personne (16/10/2026), qui font foi sur les documents :
//  - `stopped → active` par `recover` : quand Meta arrête une campagne pour un paiement, le client alimente ses fonds
//    publicitaires chez Meta puis la RELANCE LUI-MÊME depuis Pubeka (route `relaunch`, mode `recover`, S16 ; APPFLOW §11.2).
//    Aucune détection automatique : S17 se borne à afficher l'état « arrêtée ».
//  - `rejected → publishing` (LLD) : une campagne refusée repart vers « Publication », puis `sent`.
export const CAMPAIGN_STATUSES = [
  'draft',
  'publishing',
  'in_review',
  'active',
  'paused',
  'rejected',
  'ended',
  'stopped',
  'error',
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_EVENTS = [
  'publish', // clic sur Publier, ou republication après refus ou erreur
  'sent', // la plateforme a reçu la campagne
  'send_failed', // échec définitif de l'envoi
  'approve', // validée par la plateforme
  'refuse', // refusée par la plateforme
  'pause',
  'resume',
  'modify', // modification d'une campagne en diffusion : nouvelle vérification
  'finish', // date de fin ou budget épuisé
  'stop', // paiement refusé, ou supprimée chez la plateforme
  'recover', // paiement corrigé
  'reset', // abandon d'une publication en erreur : retour au brouillon
] as const;
export type CampaignEvent = (typeof CAMPAIGN_EVENTS)[number];

type TransitionTable = Readonly<
  Record<CampaignStatus, Readonly<Partial<Record<CampaignEvent, CampaignStatus>>>>
>;

export const CAMPAIGN_TRANSITIONS = {
  draft: { publish: 'publishing' },
  publishing: { sent: 'in_review', send_failed: 'error' },
  in_review: { approve: 'active', refuse: 'rejected', pause: 'paused' },
  active: { pause: 'paused', modify: 'in_review', finish: 'ended', stop: 'stopped' },
  paused: { resume: 'active', finish: 'ended', stop: 'stopped' },
  rejected: { publish: 'publishing', stop: 'stopped' },
  ended: {},
  stopped: { recover: 'active' },
  error: { publish: 'publishing', reset: 'draft' },
} as const satisfies TransitionTable;

export interface InvalidTransition {
  code: 'invalid_transition';
  from: CampaignStatus;
  event: CampaignEvent;
}

export type TransitionResult =
  { ok: true; status: CampaignStatus } | { ok: false; error: InvalidTransition };

export function nextCampaignStatus(from: CampaignStatus, event: CampaignEvent): TransitionResult {
  // `Object.hasOwn` : un événement venu de l'extérieur ne doit jamais atteindre le prototype.
  const row: Readonly<Partial<Record<CampaignEvent, CampaignStatus>>> = CAMPAIGN_TRANSITIONS[from];
  const to = Object.hasOwn(row, event) ? row[event] : undefined;
  if (to === undefined) return { ok: false, error: { code: 'invalid_transition', from, event } };
  return { ok: true, status: to };
}

export function allowedTargets(from: CampaignStatus): CampaignStatus[] {
  const row: Readonly<Partial<Record<CampaignEvent, CampaignStatus>>> = CAMPAIGN_TRANSITIONS[from];
  return [...new Set(Object.values(row))];
}

/** Le passage de `from` à `to` existe-t-il, quel que soit l'événement ? (sert à la garde SQL et à ses tests) */
export function canTransition(from: CampaignStatus, to: CampaignStatus): boolean {
  return allowedTargets(from).includes(to);
}

export function isCampaignStatus(value: string): value is CampaignStatus {
  return CAMPAIGN_STATUSES.some((s) => s === value);
}
