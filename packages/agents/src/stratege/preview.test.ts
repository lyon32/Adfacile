// Aperçu progressif : seuls les champs autorisés ET vraisemblables sont montrés (nombres, dates, listes fermées, R3).
import { describe, expect, it } from 'vitest';
import { strategeCopyContext } from './agent';
import { previewAllowed } from './preview';
import { strategeInput } from './stratege.test-helper';

const context = strategeCopyContext(strategeInput());
const TODAY = '2026-10-10';
const ok = (path: string, value: string | number | boolean | null) =>
  previewAllowed({ path, value }, TODAY, context);

describe('previewAllowed', () => {
  it('chemins non autorisés : jamais montrés (signalements, ciblage, consigne visuelle, pixel)', () => {
    for (const path of [
      'flags.0',
      'warnings.0',
      'visual_brief',
      'tracking.pixel_id',
      'advanced_targeting.age_min',
      'optimization_goal',
      'inconnu',
    ]) {
      expect(ok(path, 'x'), path).toBe(false);
    }
  });
  it('listes fermées : une valeur hors liste n’est pas montrée', () => {
    expect(ok('objective', 'OUTCOME_ENGAGEMENT')).toBe(true);
    expect(ok('objective', 'OUTCOME_LEADS')).toBe(false);
    expect(ok('destination', 'WHATSAPP')).toBe(true);
    expect(ok('destination', 'TELEGRAM')).toBe(false);
    expect(ok('copy.cta', 'SHOP_NOW')).toBe(true);
    expect(ok('copy.cta', 'BUY_ALL')).toBe(false);
    expect(ok('copy.angle', 'speed')).toBe(true);
    expect(ok('copy.angle', 'magie')).toBe(false);
  });
  it('budget : entier de 100 à 1 000 000 centimes seulement', () => {
    expect(ok('budget.daily_usd_cents', 400)).toBe(true);
    expect(ok('budget.daily_usd_cents', 99)).toBe(false);
    expect(ok('budget.daily_usd_cents', 1_000_001)).toBe(false);
    expect(ok('budget.daily_usd_cents', 4.5)).toBe(false);
    expect(ok('budget.daily_usd_cents', '400')).toBe(false);
  });
  it('rayon : entier de 1 à 80 km ; nom de ville : texte sans HTML', () => {
    expect(ok('geo.cities.0.radius_km', 10)).toBe(true);
    expect(ok('geo.cities.0.radius_km', 0)).toBe(false);
    expect(ok('geo.cities.0.radius_km', 81)).toBe(false);
    expect(ok('geo.cities.0.name', 'Abidjan')).toBe(true);
    expect(ok('geo.cities.0.name', '<b>x</b>')).toBe(false);
  });
  it('dates : réelles et non passées', () => {
    expect(ok('schedule.start_date', '2026-10-11')).toBe(true);
    expect(ok('schedule.start_date', TODAY)).toBe(true);
    expect(ok('schedule.start_date', '2026-10-09')).toBe(false);
    expect(ok('schedule.end_date', '2026-02-31')).toBe(false);
    expect(ok('schedule.end_date', 'demain')).toBe(false);
  });
  it('textes : sans nombre ni adresse inventés (R3), y compris les justifications', () => {
    expect(ok('copy.headline', 'Baskets livrées')).toBe(true);
    expect(ok('copy.primary_text', 'Baskets à 15 000 F')).toBe(false);
    expect(ok('copy.primary_text', 'Dès 25 000 F')).toBe(true);
    expect(ok('objective_reason', 'Vos clients écrivent, promis à 99 %')).toBe(false);
    expect(ok('budget.reason', 'Un petit budget')).toBe(true);
    expect(ok('geo.reason', 'Voir www.inconnu.ci')).toBe(false);
  });
  it('un nombre sous un champ texte ou un texte sous un champ nombre : refusé', () => {
    expect(ok('copy.headline', 12)).toBe(false);
    expect(ok('geo.countries.0', 'CM')).toBe(true);
    expect(ok('geo.countries.0', 12)).toBe(false);
  });
});
