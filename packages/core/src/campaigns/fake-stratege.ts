// Sortie du Stratège servie par la FAUSSE passerelle (PUBEKA_FAKE_PROVIDERS=ai : développement, préproduction, parcours).
// Elle est calculée depuis la requête (dates relatives à « aujourd'hui », WhatsApp lié ou non, ton vous/tu, angle différent
// pour « autre proposition ») : une sortie figée deviendrait invalide dès demain (la date de début doit être après-demain
// du jour). Elle ne contient aucun nombre, prix ni adresse : le contrôle R3 n'a rien à retirer. Aucun appel payant.
import type { AiCompletionRequest } from '@pubeka/agents';

const ANGLES = ['convenience', 'quality', 'speed', 'novelty', 'social_proof'] as const;

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

function addDays(day: string, days: number): string {
  const time = Date.parse(`${day}T00:00:00Z`) + days * 86_400_000;
  return new Date(time).toISOString().slice(0, 10);
}

function firstCity(profile: unknown): { country: string; city: string } | null {
  if (!isRecord(profile) || !Array.isArray(profile.locations)) return null;
  for (const location of profile.locations as unknown[]) {
    if (isRecord(location) && typeof location.city === 'string' && location.city !== '') {
      const country = typeof location.country === 'string' ? location.country : '';
      return { country, city: location.city };
    }
  }
  return null;
}

export function fakeStrategeOutput(request: AiCompletionRequest): unknown {
  const input = lastUserJson(request);
  const today =
    typeof input.today === 'string' ? input.today : new Date().toISOString().slice(0, 10);
  const english = input.output_language === 'en';
  const tu = input.ad_address === 'tu';
  const account = isRecord(input.account_state) ? input.account_state : {};
  const whatsapp = account.has_whatsapp_linked === true;
  const previous = Array.isArray(input.previous_proposals) ? input.previous_proposals.length : 0;
  const place = firstCity(input.profile);
  const country = place?.country ?? '';
  const angle = ANGLES[previous % ANGLES.length] ?? 'convenience';

  const primary = english
    ? 'New arrivals just landed. Message us to find what fits you.'
    : tu
      ? 'Nouveautés en boutique. Écris-nous pour trouver ce qui te va.'
      : 'Nouveautés en boutique. Écrivez-nous pour trouver ce qui vous convient.';
  return {
    objective: 'OUTCOME_ENGAGEMENT',
    objective_reason: english
      ? 'Customers can message you directly.'
      : 'Vos clients peuvent vous écrire directement.',
    destination: whatsapp ? 'WHATSAPP' : 'MESSENGER',
    optimization_goal: 'CONVERSATIONS',
    geo: {
      countries: country.length === 2 ? [country.toUpperCase()] : ['CM'],
      cities: place === null ? [] : [{ name: place.city, radius_km: 10 }],
      reason: english ? 'Your selling area.' : 'Votre zone de vente.',
    },
    advanced_targeting: { age_min: 18, age_max: 65, genders: 'all', advantage_plus: true },
    budget: {
      daily_usd_cents: 400,
      reason: english
        ? 'Enough to start getting messages.'
        : 'De quoi commencer à recevoir des messages.',
    },
    schedule: {
      start_date: addDays(today, 1),
      end_date: addDays(today, 7),
      reason: english
        ? 'A week lets Meta learn.'
        : 'Une semaine laisse à Meta le temps d’apprendre.',
    },
    copy: {
      primary_text: primary,
      headline: english
        ? 'Message us today'
        : tu
          ? 'Écris-nous aujourd’hui'
          : 'Écrivez-nous aujourd’hui',
      description: null,
      cta: whatsapp ? 'SEND_WHATSAPP_MESSAGE' : 'SEND_MESSAGE',
      angle,
    },
    tracking: null,
    warnings: whatsapp
      ? []
      : [
          english
            ? 'WhatsApp is not linked: customers will use Messenger.'
            : 'WhatsApp non lié : la pub enverra les clients sur Messenger.',
        ],
    visual_brief: english ? 'Product on a clean background.' : 'Produit sur fond clair.',
    flags: [],
  };
}
