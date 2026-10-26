// Sortie du Modérateur servie par la FAUSSE passerelle (PUBEKA_FAKE_PROVIDERS=ai : développement, préproduction, parcours).
// Elle est calculée depuis la requête : l'extrait cité est tiré du texte réel de la publicité (le contrôle du code exige qu'il y
// figure), la correction ne contient aucun chiffre (R3). Un motif qui parle de tabac, d'armes ou de drogues donne un produit
// interdit (aucune correction) ; un motif vague donne une cause incertaine et un nouvel examen. Aucun appel payant.
import type { AiCompletionRequest } from '@pubeka/agents';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function lastUserJson(request: AiCompletionRequest): Record<string, unknown> {
  const message = [...request.messages].reverse().find((m) => m.role === 'user');
  if (typeof message?.content !== 'string') return {};
  try {
    const parsed: unknown = JSON.parse(message.content);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

const PROHIBITED = /tobacco|tabac|weapon|arme|drug|drogue|vap(e|ing)|adult content/i;
const VAGUE = /may violate our advertising standards|n'?a pas été approuvée/i;

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function fakeModerateurOutput(request: AiCompletionRequest): unknown {
  const input = lastUserJson(request);
  const english = input.output_language === 'en';
  const ad = isRecord(input.ad) ? input.ad : {};
  const text = str(ad.primary_text);
  const reason = str(input.meta_rejection);
  const excerpt = Array.from(text).slice(0, 40).join('').trim();

  if (PROHIBITED.test(reason)) {
    return {
      rejection_category: 'prohibited_product',
      culprit: { where: 'product', excerpt: null },
      cause_certainty: 'high',
      can_fix: false,
      fix: null,
      appeal_recommended: false,
      report: english
        ? 'Meta refused this ad because the product itself is not allowed on its platforms. This is a Meta rule about the product, not about your wording. We cannot fix it with a new text. You can still sell it through other channels.'
        : 'Meta a refusé cette pub parce que le produit lui-même n’est pas autorisé sur ses plateformes. C’est une règle de Meta sur le produit, pas sur tes mots. Un nouveau texte ne peut pas la corriger. Tu peux continuer à le vendre par d’autres canaux.',
      memory_pattern: 'produit interdit par la plateforme',
    };
  }
  if (VAGUE.test(reason) || excerpt === '') {
    return {
      rejection_category: 'other',
      culprit: { where: 'unknown', excerpt: null },
      cause_certainty: 'low',
      can_fix: true,
      fix: null,
      appeal_recommended: true,
      report: english
        ? 'Meta refused this ad without naming a precise reason. We cannot see anything wrong in your text or photo. Meta may have made a mistake. We advise asking for a new review.'
        : 'Meta a refusé cette pub sans donner de raison précise. Nous ne voyons rien d’anormal dans ton texte ni dans ta photo. Meta a peut-être fait une erreur. Nous te conseillons de demander un nouvel examen.',
      memory_pattern: 'refus sans motif précis',
    };
  }
  return {
    rejection_category: 'misleading_claims',
    culprit: { where: 'primary_text', excerpt },
    cause_certainty: 'medium',
    can_fix: true,
    fix: {
      field: 'primary_text',
      original: text,
      suggested: english
        ? 'Discover our products. Message us to find what suits you.'
        : 'Découvrez nos produits. Écrivez-nous pour trouver ce qui vous convient.',
    },
    appeal_recommended: false,
    report: english
      ? 'Meta refused this ad because the start of the text makes a claim it considers misleading. The part concerned is highlighted below. We suggest a calmer text that says what you sell. Click the button to apply it and publish again.'
      : 'Meta a refusé cette pub car le début du texte fait une promesse qu’elle juge trompeuse. La partie concernée est surlignée plus bas. Nous te proposons un texte plus sobre qui dit ce que tu vends. Clique sur le bouton pour l’appliquer et republier.',
    memory_pattern: 'promesse jugée trompeuse dans le texte',
  };
}
