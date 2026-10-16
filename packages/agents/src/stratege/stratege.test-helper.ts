// Entrée et sortie valides du Stratège pour les tests (aucun modèle réel). Boutique fictive de baskets à Abidjan.
import type { ParsedStrategeInput, StrategeOutput } from './schema';
import { strategeInputSchema } from './schema';

export function strategeInput(over: Record<string, unknown> = {}): ParsedStrategeInput {
  return strategeInputSchema.parse({
    today: '2026-10-10',
    output_language: 'fr',
    ad_address: 'vous',
    profile: {
      business_name: { value: 'Sneakers Cocody', source: 0 },
      sector: { value: 'fashion_shoes', confidence: 0.9 },
      products: [{ name: 'Baskets Nike et Adidas', price: { amount: 25000, currency: 'XOF' } }],
      value_props: ['Livraison en 24 h à Abidjan'],
      locations: [{ country: 'CI', city: 'Abidjan', area: 'Cocody', delivery: true }],
      contacts: { whatsapp: '+2250707070707', website: null },
    },
    answers: [{ question: 'Sur quel numéro WhatsApp ?', answer: '+225 07 07 07 07 07' }],
    brand_kit: null,
    account_state: { has_whatsapp_linked: true, has_instagram_linked: false, pixels: [] },
    ...over,
  });
}

export function strategeOutput(over: Record<string, unknown> = {}): StrategeOutput {
  const base: StrategeOutput = {
    objective: 'OUTCOME_ENGAGEMENT',
    objective_reason:
      'Vous vendez en direct sur WhatsApp : la pub enverra les clients vous écrire.',
    destination: 'WHATSAPP',
    optimization_goal: 'CONVERSATIONS',
    geo: {
      countries: ['CI'],
      cities: [{ name: 'Abidjan', radius_km: 10 }],
      reason: 'Vous livrez à Abidjan.',
    },
    advanced_targeting: { age_min: 18, age_max: 65, genders: 'all', advantage_plus: true },
    budget: { daily_usd_cents: 400, reason: '4 $ par jour pour obtenir des conversations.' },
    schedule: {
      start_date: '2026-10-11',
      end_date: '2026-10-17',
      reason: '7 jours laissent à Meta le temps d’apprendre.',
    },
    copy: {
      primary_text:
        'Nouvelles baskets à Cocody 👟 À partir de 25 000 F, livrées en 24 h. Écrivez-nous sur WhatsApp.',
      headline: 'Baskets livrées à Abidjan',
      description: null,
      cta: 'SEND_WHATSAPP_MESSAGE',
      angle: 'speed',
    },
    tracking: null,
    warnings: [],
    visual_brief: 'Baskets blanches sur fond urbain, prix en évidence.',
    flags: [],
  };
  return { ...base, ...over };
}
