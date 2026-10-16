// Règles pures de l'étape « Proposition » : aperçu progressif, dollars en entiers, validation, PATCH minimal.
import { describe, expect, it } from 'vitest';
import { fromPreview } from './proposal-display';
import type { Campaign } from './proposal-api';
import {
  applyField,
  estimateXaf,
  buildPatch,
  formFromCampaign,
  parseUsdInput,
  previewText,
  usdInputFromCents,
  validateForm,
  withObjective,
  type EditForm,
} from './proposal-model';

const CAMPAIGN: Campaign = {
  id: 'c1',
  status: 'draft',
  version: 3,
  name: 'Ma pub',
  editable: true,
  objective: 'OUTCOME_ENGAGEMENT',
  destination: 'WHATSAPP',
  geo: { countries: ['CI'], cities: [{ name: 'Abidjan', radius_km: 10 }] },
  targeting: {},
  daily_budget_usd_cents: 400,
  start_date: '2026-10-13',
  end_date: '2026-10-19',
  copy: { primary_text: 'Texte', headline: 'Titre', description: '', cta: 'SEND_WHATSAPP_MESSAGE' },
  chosen_proposal_version: 1,
  cost: { status: 'ok' },
};
const TODAY = '2026-10-12';

function form(over: Partial<EditForm> = {}): EditForm {
  const base = formFromCampaign(CAMPAIGN);
  if (base === null) throw new Error('formulaire attendu');
  return { ...base, ...over };
}

describe('applyField', () => {
  it('range les valeurs à leur chemin, y compris dans les tableaux, sans modifier l’entrée', () => {
    const start = {};
    const a = applyField(start, 'objective', 'OUTCOME_ENGAGEMENT');
    const b = applyField(a, 'geo.cities.0.name', 'Douala');
    const c = applyField(b, 'geo.cities.0.radius_km', 10);
    const d = applyField(c, 'geo.cities.1.name', 'Yaoundé');
    expect(start).toEqual({});
    expect(a).toEqual({ objective: 'OUTCOME_ENGAGEMENT' });
    expect(d).toEqual({
      objective: 'OUTCOME_ENGAGEMENT',
      geo: { cities: [{ name: 'Douala', radius_km: 10 }, { name: 'Yaoundé' }] },
    });
    expect(previewText(d, 'objective')).toBe('OUTCOME_ENGAGEMENT');
    expect(previewText(d, 'geo.cities.1.name')).toBe('Yaoundé');
    expect(previewText(d, 'geo.cities.2.name')).toBeNull();
    expect(previewText(d, 'absent.chemin')).toBeNull();
  });
  it('un champ qui revient (nouvel essai) remplace l’ancien', () => {
    expect(applyField({ copy: { headline: 'A' } }, 'copy.headline', 'B')).toEqual({
      copy: { headline: 'B' },
    });
  });
});

describe('fromPreview (aperçu → fiche)', () => {
  it('seuls les champs terminés sont remplis ; les autres restent vides', () => {
    const d = fromPreview({
      objective: 'OUTCOME_ENGAGEMENT',
      copy: { headline: 'Titre' },
      destination: 'inconnue',
    });
    expect(d.objective).toBe('OUTCOME_ENGAGEMENT');
    expect(d.headline).toBe('Titre');
    expect(d.primaryText).toBeNull();
    expect(d.destination).toBeNull();
    expect(d.cities).toBeNull();
    expect(d.budgetUsdCents).toBeNull();
  });
  it('zone : villes complètes seulement', () => {
    const d = fromPreview({
      geo: {
        countries: ['CI'],
        cities: [{ name: 'Abidjan', radius_km: 10 }, { name: 'Sans rayon' }],
      },
    });
    expect(d.cities).toEqual([{ name: 'Abidjan', radiusKm: 10 }]);
  });
});

describe('dollars en entiers', () => {
  it.each([
    ['4', 400],
    ['4.5', 450],
    ['4,50', 450],
    ['4.05', 405],
    ['0.99', 99],
    ['1', 100],
    [' 10000 ', 1_000_000],
  ])('parseUsdInput(%j) = %s', (text, cents) => {
    expect(parseUsdInput(text)).toBe(cents);
  });
  it.each(['', 'abc', '1e3', '-1', '4.555', '4,', '.5', '1 000', '4$'])(
    'parseUsdInput(%j) refuse',
    (text) => {
      expect(parseUsdInput(text)).toBeNull();
    },
  );
  it('usdInputFromCents', () => {
    expect(usdInputFromCents(400)).toBe('4');
    expect(usdInputFromCents(450)).toBe('4.50');
    expect(usdInputFromCents(405)).toBe('4.05');
    expect(usdInputFromCents(99)).toBe('0.99');
  });
});

describe('validateForm (mêmes limites que le serveur)', () => {
  it('un formulaire propre n’a aucune erreur', () => {
    expect(validateForm(form(), TODAY)).toEqual({});
  });
  it('budget : 99 centimes refusés, 1 $ accepté, 10 000 $ accepté, au-delà refusé, texte refusé', () => {
    expect(validateForm(form({ budget: '0.99' }), TODAY).budget).toBe('budget_too_low');
    expect(validateForm(form({ budget: '1' }), TODAY).budget).toBeUndefined();
    expect(validateForm(form({ budget: '10000' }), TODAY).budget).toBeUndefined();
    expect(validateForm(form({ budget: '10000.01' }), TODAY).budget).toBe('budget_too_high');
    expect(validateForm(form({ budget: 'beaucoup' }), TODAY).budget).toBe('budget_invalid');
  });
  it('dates : passée, fin avant début, égale, plus de 365 jours, inexistante', () => {
    expect(validateForm(form({ startDate: '2026-10-11' }), TODAY).startDate).toBe('start_past');
    expect(validateForm(form({ startDate: TODAY }), TODAY).startDate).toBeUndefined();
    expect(validateForm(form({ endDate: '2026-10-13' }), TODAY).endDate).toBe('end_before_start');
    expect(validateForm(form({ endDate: '2026-10-12' }), TODAY).endDate).toBe('end_before_start');
    // 365 jours, début et fin compris : 13/10/2026 → 12/10/2027 ; un de plus est refusé.
    expect(validateForm(form({ endDate: '2027-10-12' }), TODAY).endDate).toBeUndefined();
    expect(validateForm(form({ endDate: '2027-10-13' }), TODAY).endDate).toBe('span_too_long');
    expect(validateForm(form({ startDate: '2026-02-31' }), TODAY).startDate).toBe('start_invalid');
    expect(validateForm(form({ endDate: '' }), TODAY).endDate).toBe('end_invalid');
  });
  it('textes : obligatoires, 125 / 40 / 30 en points de code, sans balise', () => {
    expect(validateForm(form({ primaryText: ' ' }), TODAY).primaryText).toBe('primary_required');
    expect(validateForm(form({ primaryText: 'a'.repeat(126) }), TODAY).primaryText).toBe(
      'primary_too_long',
    );
    expect(
      validateForm(form({ primaryText: '👟'.repeat(125) }), TODAY).primaryText,
    ).toBeUndefined();
    expect(validateForm(form({ headline: 'b'.repeat(41) }), TODAY).headline).toBe(
      'headline_too_long',
    );
    expect(validateForm(form({ headline: '' }), TODAY).headline).toBe('headline_required');
    expect(validateForm(form({ description: 'c'.repeat(31) }), TODAY).description).toBe(
      'description_too_long',
    );
    expect(validateForm(form({ description: '' }), TODAY).description).toBeUndefined();
    expect(validateForm(form({ primaryText: '<b>x</b>' }), TODAY).primaryText).toBe('html');
  });
  it('villes : nom obligatoire, rayon de 1 à 80', () => {
    const errors = validateForm(
      form({
        cities: [
          { name: '', radius: '10' },
          { name: 'Douala', radius: '0' },
          { name: 'Yaoundé', radius: '81' },
          { name: 'Kribi', radius: '80' },
        ],
      }),
      TODAY,
    );
    expect(errors['city.0.name']).toBe('city_name');
    expect(errors['city.1.radius']).toBe('city_radius');
    expect(errors['city.2.radius']).toBe('city_radius');
    expect(errors['city.3.radius']).toBeUndefined();
  });
  it('destination incompatible avec l’objectif', () => {
    expect(validateForm(form({ objective: 'OUTCOME_TRAFFIC' }), TODAY).destination).toBe(
      'destination_mismatch',
    );
  });
});

describe('withObjective', () => {
  it('garde la destination si elle convient, sinon prend la première permise', () => {
    expect(withObjective(form(), 'OUTCOME_ENGAGEMENT').destination).toBe('WHATSAPP');
    expect(withObjective(form(), 'OUTCOME_SALES')).toMatchObject({
      objective: 'OUTCOME_SALES',
      destination: 'WEBSITE',
    });
    expect(withObjective(form(), 'OUTCOME_AWARENESS').destination).toBe('NONE');
  });
});

describe('buildPatch', () => {
  it('rien n’a changé : pas de PATCH', () => {
    expect(buildPatch(form(), CAMPAIGN)).toBeNull();
  });
  it('seuls les champs changés partent, avec la version lue', () => {
    expect(buildPatch(form({ headline: 'Nouveau', budget: '5' }), CAMPAIGN)).toEqual({
      version: 3,
      daily_budget_usd_cents: 500,
      copy: { headline: 'Nouveau' },
    });
  });
  it('zone : remplacée en entier, jamais de ciblage par centres d’intérêt', () => {
    const patch = buildPatch(form({ cities: [{ name: 'Douala', radius: '15' }] }), CAMPAIGN);
    expect(patch?.geo).toEqual({ countries: ['CI'], cities: [{ name: 'Douala', radius_km: 15 }] });
    expect(patch).not.toHaveProperty('targeting');
  });
  it('objectif, destination, dates et bouton', () => {
    const patch = buildPatch(
      form({
        objective: 'OUTCOME_SALES',
        destination: 'WEBSITE',
        startDate: '2026-10-14',
        endDate: '2026-10-20',
        cta: 'SHOP_NOW',
      }),
      CAMPAIGN,
    );
    expect(patch).toMatchObject({
      objective: 'OUTCOME_SALES',
      destination: 'WEBSITE',
      start_date: '2026-10-14',
      end_date: '2026-10-20',
      copy: { cta: 'SHOP_NOW' },
    });
  });
  it('campagne sans objectif : pas de formulaire', () => {
    expect(formFromCampaign({ ...CAMPAIGN, objective: null })).toBeNull();
  });
});

describe('estimateXaf : FCFA estimés en entiers (arrondi à la demi-unité vers le haut), jamais de flottant', () => {
  it('400 centimes à 600 FCFA le dollar = 2 400', () => {
    expect(estimateXaf(400, 600)).toBe(2400);
  });
  it('demi-unité arrondie vers le haut : 1 centime à 50 FCFA = 0,5 → 1', () => {
    expect(estimateXaf(1, 50)).toBe(1);
    expect(estimateXaf(1, 49.9)).toBe(0);
  });
  it('taux décimal conservé au dix-millième : 100 centimes à 655,957 = 656', () => {
    expect(estimateXaf(100, 655.957)).toBe(656);
    expect(estimateXaf(1000, 655.957)).toBe(6560);
  });
  it('taux invalide ou nul : aucune estimation', () => {
    expect(estimateXaf(400, 0)).toBeNull();
    expect(estimateXaf(400, -1)).toBeNull();
    expect(estimateXaf(400, Number.NaN)).toBeNull();
  });
  it('toujours un entier, même pour un grand budget', () => {
    const value = estimateXaf(99_999_900, 655.957);
    expect(Number.isInteger(value)).toBe(true);
    expect(value).toBe(655_956_344);
  });
});
