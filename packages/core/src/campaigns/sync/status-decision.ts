// Que faire quand Meta et Pubeka ne sont pas d'accord sur le statut d'une campagne ? (TR-PLA-05, EC-META-08)
//
// META FAIT FOI pour le statut d'une campagne publiée (ARCHITECTURE §6, SECURITY_NOTES EC-META-08) : on traduit le statut lu
// chez Meta en un ÉVÉNEMENT de la machine d'état (`nextCampaignStatus`), jamais en un statut écrit à la main. Si la machine
// refuse l'événement, rien n'est écrit (la différence est seulement journalisée). Fonction pure.
//
// Statuts effectifs d'une publicité (documentation de Meta, objet Ad, champ `effective_status`) : ACTIVE, PAUSED, DELETED,
// PENDING_REVIEW, DISAPPROVED, PREAPPROVED, PENDING_BILLING_INFO, CAMPAIGN_PAUSED, ARCHIVED, ADSET_PAUSED, IN_PROCESS,
// WITH_ISSUES. Il n'existe pas de statut « terminée » : la fin est décidée par la date de fin de Pubeka.
//
// Décisions :
//  - PENDING_BILLING_INFO = problème de paiement chez Meta → `stop` (« Arrêtée : le paiement Meta a échoué », APPFLOW §11.2) ;
//  - DELETED / ARCHIVED → `stop` (EC-META-08 : « supprimée → stopped, historique conservé ») ;
//  - une campagne ARRÊTÉE qui redevient ACTIVE chez Meta n'est PAS relancée toute seule : c'est une action du client (route
//    `relaunch`, décision du 16/10/2026, « aucune détection automatique ») ;
//  - WITH_ISSUES et tout statut inconnu : journalisés, aucun changement de statut (« à regarder, pas à cacher »).
import type { PlatformStatus } from '@pubeka/platforms';
import { nextCampaignStatus, type CampaignEvent, type CampaignStatus } from '../campaign-state';

export type StatusDecisionReason =
  | 'in_sync'
  | 'applied'
  | 'ended_by_date'
  | 'client_action_required'
  | 'not_allowed'
  | 'needs_attention';

export interface StatusDecision {
  event: CampaignEvent | null;
  reason: StatusDecisionReason;
}

export interface StatusDecisionInput {
  current: CampaignStatus;
  remote: PlatformStatus;
  /** AAAA-MM-JJ, date de fin choisie dans Pubeka. */
  endDate: string | null;
  /** AAAA-MM-JJ, aujourd'hui. */
  today: string;
}

const BILLING_STATUSES: readonly string[] = ['PENDING_BILLING_INFO'];

function remoteEvent(current: CampaignStatus, remote: PlatformStatus): CampaignEvent | null {
  if (BILLING_STATUSES.includes(remote.rawStatus)) return current === 'error' ? null : 'stop';
  // Campagne en ERREUR chez Pubeka mais vivante chez Meta (republication refusée, activation incertaine) : le vrai statut remonte.
  if (current === 'error') {
    if (remote.status === 'active') return 'approve';
    if (remote.status === 'in_review') return 'sent';
    if (remote.status === 'paused') return 'pause';
    return null;
  }
  switch (remote.status) {
    case 'active':
      if (current === 'in_review') return 'approve';
      if (current === 'paused') return 'resume';
      return null;
    case 'paused':
      return current === 'active' || current === 'in_review' ? 'pause' : null;
    case 'in_review':
      return current === 'active' ? 'modify' : null;
    case 'rejected':
      return current === 'in_review' ? 'refuse' : null;
    case 'stopped':
      return 'stop';
    case 'ended':
      return 'finish';
    case 'error':
      return null;
  }
}

/** Statut de Pubeka qui correspond au statut lu chez Meta (sert à dire « d'accord » ou « pas d'accord »). */
function agrees(current: CampaignStatus, remote: PlatformStatus): boolean {
  if (BILLING_STATUSES.includes(remote.rawStatus)) return current === 'stopped';
  if (remote.status === 'error') return false;
  return current === remote.status;
}

export function decideStatusEvent(input: StatusDecisionInput): StatusDecision {
  const { current, remote } = input;
  const finished =
    (current === 'active' || current === 'paused') &&
    input.endDate !== null &&
    input.today > input.endDate;
  // Fin de diffusion choisie dans Pubeka : seulement si Meta ne contredit pas (pas supprimée, pas de facturation en échec).
  if (finished && (remote.status === 'active' || remote.status === 'paused')) {
    return { event: 'finish', reason: 'ended_by_date' };
  }
  if (remote.status === 'active' && current === 'stopped') {
    return { event: null, reason: 'client_action_required' };
  }
  if (remote.status === 'error' && !BILLING_STATUSES.includes(remote.rawStatus)) {
    return { event: null, reason: 'needs_attention' };
  }
  if (agrees(current, remote)) return { event: null, reason: 'in_sync' };
  const event = remoteEvent(current, remote);
  if (event === null || !nextCampaignStatus(current, event).ok) {
    return { event: null, reason: 'not_allowed' };
  }
  return { event, reason: 'applied' };
}
