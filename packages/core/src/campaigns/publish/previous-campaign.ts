// Que faire de l'ANCIENNE campagne d'une republication après refus (S18) ? Une seule règle, partagée par la route (qui lit avant
// d'écrire) et par la tâche (qui relit avant de supprimer et de créer) : la nouvelle campagne ne peut être créée que si l'ancienne ne
// peut plus diffuser ni dépenser.
//
//  - `removable` : Meta la montre refusée ou en pause : elle ne dépense pas, on peut la supprimer ;
//  - `absent`    : Meta la montre SUPPRIMÉE ou ARCHIVÉE. Documentation de Meta (« Manage your ad object's status »,
//                  https://developers.facebook.com/documentation/ads-commerce/marketing-api/best-practices/manage-your-ad-object-status) :
//                  un objet DELETED ou ARCHIVED existe toujours et se lit par son identifiant (« Query by its own ID : Yes »), ses
//                  objets enfants héritent de son statut, il ne diffuse plus. Ce n'est donc pas une erreur de lecture : le statut
//                  effectif est DELETED ou ARCHIVED. Rien à supprimer, on peut créer ;
//  - `live`      : tout le reste (diffuse, en vérification, arrêtée mais vivante, problème de paiement…) : JAMAIS prise pour absente.
// Une erreur de lecture (objet introuvable, permission, réseau) n'est PAS classée ici : la documentation ne dit pas ce que renvoie un
// identifiant inconnu, donc l'appelant la traite comme « illisible » et ne crée rien.
import type { PlatformStatus } from '@pubeka/platforms';

export type PreviousCampaignState = 'removable' | 'absent' | 'live';

export function classifyPreviousCampaign(
  status: Pick<PlatformStatus, 'status' | 'rawStatus'>,
): PreviousCampaignState {
  const raw = status.rawStatus.toUpperCase();
  if (raw === 'DELETED' || raw === 'ARCHIVED') return 'absent';
  if (status.status === 'rejected' || status.status === 'paused') return 'removable';
  return 'live';
}
