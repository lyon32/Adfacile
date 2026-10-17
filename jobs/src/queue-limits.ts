// Files d'attente et leurs limites de simultanéité (ARCHITECTURE §8.4). Table pure, sans dépendance à Trigger.dev :
// les tests la lisent, `queues.ts` la déclare auprès de Trigger.dev.
export const QUEUE_NAMES = [
  'media-fal',
  'media-higgsfield',
  'media-byteplus-video',
  'agents',
  'meta-publish',
] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];

/**
 * Nombre maximal de tâches simultanées par file.
 * - `media-higgsfield` : 20 par clé API (confirmé par le fournisseur, ticket #318114).
 * - `media-fal` : « selon le compte (2 à 40) » ; 2 tant que le palier du compte n'est pas relevé (à revoir en S21).
 * - `media-byteplus-video` : 3 (compte individuel).
 * - `agents` : selon la passerelle IA ; 5 pour commencer (à confirmer en S14, mesure réelle).
 * - `meta-publish` : publications chez Meta (S16). 5 en même temps pour rester loin des limites de débit de l'API Meta par compte
 *   publicitaire (à mesurer ; EC-META-10) ; une publication prend quelques secondes à une minute.
 * L'offre gratuite de Trigger.dev plafonne de toute façon à 10 tâches en même temps (ARCHITECTURE §2).
 */
export const QUEUE_CONCURRENCY: Readonly<Record<QueueName, number>> = {
  'media-fal': 2,
  'media-higgsfield': 20,
  'media-byteplus-video': 3,
  agents: 5,
  'meta-publish': 5,
};
