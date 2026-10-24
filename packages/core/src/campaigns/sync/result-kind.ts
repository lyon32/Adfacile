// Le « résultat » d'une campagne, traduit en mots (F7, APPFLOW §11.3) : « 42 messages WhatsApp, soit 357 FCFA par client
// potentiel ». Le serveur dit QUEL résultat c'est (`kind`) ; l'écran écrit la phrase dans la langue de la personne.
//
// Le type vient de Meta (Insights › actions, voir le connecteur) ; pour une conversation, le canal vient de la destination
// choisie dans la campagne. Un type inconnu n'est pas deviné : `null`, et l'écran n'affiche aucune phrase.
export const RESULT_KINDS = [
  'whatsapp_conversation',
  'messenger_conversation',
  'instagram_conversation',
  'conversation',
  'purchase',
  'lead',
  'link_click',
  'post_engagement',
] as const;
export type ResultKind = (typeof RESULT_KINDS)[number];

const CONVERSATION = 'onsite_conversion.messaging_conversation_started_7d';

export function resultKindOf(
  resultType: string | null,
  destination: string | null,
): ResultKind | null {
  switch (resultType) {
    case CONVERSATION:
      if (destination === 'WHATSAPP') return 'whatsapp_conversation';
      if (destination === 'MESSENGER') return 'messenger_conversation';
      if (destination === 'INSTAGRAM_DIRECT') return 'instagram_conversation';
      return 'conversation';
    case 'purchase':
    case 'omni_purchase':
      return 'purchase';
    case 'lead':
      return 'lead';
    case 'link_click':
      return 'link_click';
    case 'post_engagement':
      return 'post_engagement';
    case null:
    default:
      return null;
  }
}
