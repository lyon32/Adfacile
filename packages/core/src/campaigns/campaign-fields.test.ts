// Règles de validation des champs d'une campagne (SECURITY_NOTES §3.2) : budget, dates, textes, zone, ciblage.
import { describe, expect, it } from 'vitest';
import { AppError } from '@pubeka/contracts';
import {
  MAX_DAILY_BUDGET_USD_CENTS,
  MIN_DAILY_BUDGET_USD_CENTS,
  checkCampaignFields,
  codePointLength,
  type CampaignFields,
} from './campaign-fields';

const TODAY = '2026-10-12';
const ok: CampaignFields = {
  objective: 'OUTCOME_ENGAGEMENT',
  destination: 'WHATSAPP',
  dailyBudgetUsdCents: 500,
  startDate: '2026-10-13',
  endDate: '2026-10-19',
  copy: { primary_text: 'Texte', headline: 'Titre', description: null },
  targeting: { age_min: 18, age_max: 65 },
  geo: { countries: ['CM'], cities: [{ name: 'Douala', radius_km: 10 }] },
};

function run(patch: Partial<CampaignFields>, changed: string[]): AppError | null {
  try {
    checkCampaignFields({ ...ok, ...patch }, new Set(changed), TODAY);
    return null;
  } catch (e) {
    if (e instanceof AppError) return e;
    throw e;
  }
}

describe('codePointLength', () => {
  it('compte les points de code : un émoji compte pour 1', () => {
    expect(codePointLength('abc')).toBe(3);
    expect(codePointLength('👟')).toBe(1);
    expect(codePointLength('é')).toBe(1);
  });
});

describe('budget quotidien (TR-PLA-10)', () => {
  it('99 centimes : 422 budget_too_low avec le minimum', () => {
    const e = run({ dailyBudgetUsdCents: 99 }, ['daily_budget_usd_cents']);
    expect(e?.code).toBe('budget_too_low');
    expect(e?.opts.meta).toMatchObject({ min_usd_cents: MIN_DAILY_BUDGET_USD_CENTS });
  });
  it('100 centimes : accepté', () => {
    expect(run({ dailyBudgetUsdCents: 100 }, ['daily_budget_usd_cents'])).toBeNull();
  });
  it('1 000 000 accepté, 1 000 001 refusé en validation_failed (faute de frappe)', () => {
    expect(
      run({ dailyBudgetUsdCents: MAX_DAILY_BUDGET_USD_CENTS }, ['daily_budget_usd_cents']),
    ).toBeNull();
    const e = run({ dailyBudgetUsdCents: MAX_DAILY_BUDGET_USD_CENTS + 1 }, [
      'daily_budget_usd_cents',
    ]);
    expect(e?.code).toBe('validation_failed');
    expect(e?.opts.errors?.[0]).toMatchObject({
      field: 'daily_budget_usd_cents',
      code: 'too_large',
    });
  });
  it('un budget qui n’est pas modifié n’est pas revalidé (ancien brouillon)', () => {
    expect(run({ dailyBudgetUsdCents: 50 }, ['name'])).toBeNull();
  });
});

describe('dates (début ≥ aujourd’hui, fin > début, durée ≤ 365 jours)', () => {
  it('début aujourd’hui accepté, hier refusé', () => {
    expect(run({ startDate: TODAY }, ['start_date'])).toBeNull();
    const e = run({ startDate: '2026-10-11' }, ['start_date']);
    expect(e?.opts.errors?.[0]).toMatchObject({ field: 'start_date', code: 'invalid_value' });
  });
  it('fin égale au début refusée, lendemain accepté', () => {
    const same = run({ startDate: '2026-10-13', endDate: '2026-10-13' }, ['end_date']);
    expect(same?.opts.errors?.[0]).toMatchObject({ field: 'end_date', code: 'invalid_value' });
    expect(run({ startDate: '2026-10-13', endDate: '2026-10-14' }, ['end_date'])).toBeNull();
  });
  it('fin avant le début refusée', () => {
    expect(
      run({ startDate: '2026-10-20', endDate: '2026-10-14' }, ['start_date', 'end_date'])?.code,
    ).toBe('validation_failed');
  });
  it('durée : 365 jours au plus, début ET fin compris (365 acceptés, 366 refusés)', () => {
    // du 13/10/2026 au 12/10/2027 = 365 jours comptés début et fin inclus
    expect(run({ startDate: '2026-10-13', endDate: '2027-10-12' }, ['end_date'])).toBeNull();
    const e = run({ startDate: '2026-10-13', endDate: '2027-10-13' }, ['end_date']);
    expect(e?.opts.errors?.[0]).toMatchObject({ field: 'end_date', code: 'too_large' });
  });
  it('date inexistante ou mal formée refusée', () => {
    expect(run({ startDate: '2026-02-31' }, ['start_date'])?.code).toBe('validation_failed');
    expect(run({ endDate: '19/10/2026' }, ['end_date'])?.code).toBe('validation_failed');
  });
  it('des dates anciennes mais non modifiées ne bloquent pas un autre champ', () => {
    expect(run({ startDate: '2026-01-01', endDate: '2026-01-07' }, ['name'])).toBeNull();
  });
});

describe('textes de la pub', () => {
  it('limites 125 / 40 / 30 en points de code', () => {
    const copy = {
      primary_text: 'a'.repeat(125),
      headline: 'b'.repeat(40),
      description: 'c'.repeat(30),
    };
    expect(run({ copy }, ['copy'])).toBeNull();
    const too = run({ copy: { ...copy, primary_text: 'a'.repeat(126) } }, ['copy']);
    expect(too?.opts.errors?.[0]).toMatchObject({ field: 'copy.primary_text', code: 'too_long' });
    expect(
      run({ copy: { ...copy, headline: 'b'.repeat(41) } }, ['copy'])?.opts.errors?.[0]?.field,
    ).toBe('copy.headline');
    expect(
      run({ copy: { ...copy, description: 'c'.repeat(31) } }, ['copy'])?.opts.errors?.[0]?.field,
    ).toBe('copy.description');
  });
  it('125 émojis tiennent dans le texte principal (1 point de code chacun)', () => {
    expect(
      run({ copy: { primary_text: '👟'.repeat(125), headline: 'T', description: null } }, ['copy']),
    ).toBeNull();
    expect(
      run({ copy: { primary_text: '👟'.repeat(126), headline: 'T', description: null } }, ['copy'])
        ?.code,
    ).toBe('validation_failed');
  });
  it('pas de HTML', () => {
    const e = run(
      { copy: { primary_text: '<script>alert(1)</script>', headline: 'T', description: null } },
      ['copy'],
    );
    expect(e?.opts.errors?.[0]).toMatchObject({
      field: 'copy.primary_text',
      code: 'invalid_format',
    });
    expect(
      run({ copy: { primary_text: 'Dès 5 < 10 000 F', headline: 'T', description: null } }, [
        'copy',
      ]),
    ).toBeNull();
  });
  it('un texte principal ou un titre vide est refusé', () => {
    expect(
      run({ copy: { primary_text: '', headline: 'T', description: null } }, ['copy'])?.opts
        .errors?.[0],
    ).toMatchObject({ field: 'copy.primary_text', code: 'required' });
  });
});

describe('ciblage et zone', () => {
  it('âge minimum supérieur à l’âge maximum refusé', () => {
    const e = run({ targeting: { age_min: 40, age_max: 30 } }, ['targeting']);
    expect(e?.opts.errors?.[0]).toMatchObject({
      field: 'targeting.age_min',
      code: 'invalid_value',
    });
  });
  it('rayon de ville entre 1 et 80 km, 20 villes au plus', () => {
    expect(run({ geo: { cities: [{ name: 'Douala', radius_km: 0 }] } }, ['geo'])?.code).toBe(
      'validation_failed',
    );
    expect(run({ geo: { cities: [{ name: 'Douala', radius_km: 81 }] } }, ['geo'])?.code).toBe(
      'validation_failed',
    );
    const cities = Array.from({ length: 21 }, (_, i) => ({ name: `V${String(i)}`, radius_km: 10 }));
    expect(run({ geo: { cities } }, ['geo'])?.code).toBe('validation_failed');
  });
  it('une zone vide (ni pays ni ville) est refusée', () => {
    expect(run({ geo: { countries: [], cities: [] } }, ['geo'])?.code).toBe('validation_failed');
  });
});

describe('objectif et destination compatibles (PRD §7.1)', () => {
  it.each([
    ['OUTCOME_ENGAGEMENT', 'WHATSAPP', true],
    ['OUTCOME_ENGAGEMENT', 'MESSENGER', true],
    ['OUTCOME_ENGAGEMENT', 'INSTAGRAM_DIRECT', true],
    ['OUTCOME_ENGAGEMENT', 'ON_POST', true],
    ['OUTCOME_ENGAGEMENT', 'WEBSITE', false],
    ['OUTCOME_TRAFFIC', 'WEBSITE', true],
    ['OUTCOME_TRAFFIC', 'APP', true],
    ['OUTCOME_TRAFFIC', 'WHATSAPP', false],
    ['OUTCOME_AWARENESS', 'NONE', true],
    ['OUTCOME_AWARENESS', 'WEBSITE', false],
    ['OUTCOME_SALES', 'WEBSITE', true],
    ['OUTCOME_SALES', 'APP', false],
  ])('%s + %s : %s', (objective, destination, allowed) => {
    const e = run({ objective, destination }, ['objective', 'destination']);
    if (allowed) expect(e).toBeNull();
    else expect(e?.opts.errors?.[0]).toMatchObject({ field: 'destination', code: 'invalid_value' });
  });
  it('objectif ou destination encore vide : pas de contrôle', () => {
    expect(run({ objective: 'OUTCOME_SALES', destination: null }, ['objective'])).toBeNull();
  });
});

describe('plusieurs erreurs à la fois', () => {
  it('toutes sont renvoyées, champ par champ', () => {
    const e = run(
      {
        startDate: '2026-10-01',
        copy: { primary_text: 'a'.repeat(200), headline: 'T', description: null },
      },
      ['start_date', 'copy'],
    );
    expect(e?.opts.errors?.map((x) => x.field).sort()).toEqual(['copy.primary_text', 'start_date']);
  });
});
