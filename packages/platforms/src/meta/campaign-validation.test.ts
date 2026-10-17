import { describe, expect, it } from 'vitest';
import type { PublishSpec } from '../types';
import { assertValidCampaign, validateCampaignData } from './campaign-validation';

// Tests portés de backend/src/controllers/campaignValidation.test.js (TR-PLA-02, TR-PLA-10).
// Campagne minimale valide, servant de base aux variantes.
const BASE: PublishSpec = {
  objective: 'OUTCOME_TRAFFIC',
  campaignName: 'Campagne test',
  adAccountId: 'act_1',
  account: { code: 'USD' },
  page: {
    id: '799671609906273',
    name: 'Lyon Deals',
    instagramAccountId: null,
    instagramConnected: false,
    whatsappConnected: false,
    whatsappNumber: null,
    whatsappPhoneNumberId: null,
  },
  targeting: { locations: [{ key: '1', type: 'city' }], ageMin: 18, ageMax: 65 },
  dailyBudgetUsdCents: 820, // 5 000 FCFA
  startDate: '2026-10-10',
  destinationType: 'WEBSITE',
  creative: { message: 'Texte', headline: 'Titre', link: 'https://exemple.com' },
};

const valider = (data: PublishSpec) => validateCampaignData(data);
const assertValide = (data: PublishSpec) => {
  assertValidCampaign(data);
};

const erreurs = (data: PublishSpec): string => valider(data).errors.join(' ');

describe('validation de campagne — règles auparavant absentes', () => {
  it('accepte la campagne minimale valide', () => {
    expect(valider(BASE)).toEqual({ valid: true, errors: [] });
  });

  it('refuse un âge minimum supérieur au maximum', () => {
    const r = valider({
      ...BASE,
      targeting: { ...BASE.targeting, ageMin: 60, ageMax: 20 },
    });
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/âge minimum ne peut pas dépasser/i);
  });

  it('refuse une date de fin antérieure au début', () => {
    expect(erreurs({ ...BASE, startDate: '2026-09-10', endDate: '2026-09-01' })).toMatch(
      /postérieure/i,
    );
  });

  it('exige une date de fin avec un budget total', () => {
    // Meta refuse un lifetime_budget sans end_time ; le service échouait après avoir créé la campagne.
    expect(erreurs({ ...BASE, budgetType: 'lifetime' })).toMatch(/date de fin/i);
  });

  it('emploie le minimum de budget réellement appliqué, 1 $ par jour, pas 1000 en dur (TR-PLA-10)', () => {
    expect(erreurs({ ...BASE, dailyBudgetUsdCents: 99 })).toContain('1 $ par jour');
    expect(valider({ ...BASE, dailyBudgetUsdCents: 100 }).valid).toBe(true);
  });

  it('le minimum est exprimé en dollars : aucune monnaie locale ni taux dans le message', () => {
    const r = valider({ ...BASE, dailyBudgetUsdCents: 1 });
    expect(r.errors.join(' ')).not.toMatch(/FCFA/);
  });

  it("n'exige pas de titre pour une publicité de messagerie", () => {
    const r = valider({
      ...BASE,
      destinationType: 'MESSENGER',
      messagingDestinations: ['messenger'],
      creative: { message: 'Texte', headline: '', link: '' },
    });
    expect(r.errors.join(' ')).not.toMatch(/titre/i);
    expect(r.valid).toBe(true);
  });

  it('exige toujours un titre pour une publicité vers un site web', () => {
    expect(erreurs({ ...BASE, creative: { ...BASE.creative, headline: '' } })).toMatch(/titre/i);
  });

  it('exige le nom, une localisation, le texte et le lien', () => {
    const r = erreurs({
      ...BASE,
      campaignName: '  ',
      targeting: { locations: [] },
      creative: { headline: 'T' },
    });
    expect(r).toMatch(/nom de la campagne est requis/);
    expect(r).toMatch(/localisation/);
    expect(r).toMatch(/texte de la publicité/);
    expect(r).toMatch(/URL de destination/);
  });

  it('refuse un nom trop long et des âges hors bornes', () => {
    const r = erreurs({
      ...BASE,
      campaignName: 'x'.repeat(256),
      targeting: { ...BASE.targeting, ageMin: 10, ageMax: 80 },
    });
    expect(r).toMatch(/255 caractères/);
    expect(r).toMatch(/âge minimum doit être entre 18 et 65/);
    expect(r).toMatch(/âge maximum doit être entre 18 et 65/);
  });
});

describe('validation de campagne — médias multiples', () => {
  const img = { url: 'https://cdn/1.jpg', type: 'image' as const };

  it("refuse un carrousel d'une seule carte avant tout appel à Meta", () => {
    expect(
      erreurs({
        ...BASE,
        creative: { ...BASE.creative, mediaType: 'carousel', mediaItems: [img] },
      }),
    ).toMatch(/2 à 10/);
  });

  it('refuse une vidéo seule sans fichier', () => {
    expect(erreurs({ ...BASE, creative: { ...BASE.creative, mediaType: 'video' } })).toMatch(
      /vidéo/i,
    );
  });
});

describe('assertValidCampaign', () => {
  it('lève validation_failed avec une entrée par message', () => {
    try {
      assertValide({ ...BASE, dailyBudgetUsdCents: 0 });
      expect.unreachable();
    } catch (err) {
      expect(err).toMatchObject({ code: 'validation_failed', status: 400 });
    }
  });

  it('ne lève rien pour une campagne valide', () => {
    expect(() => {
      assertValide(BASE);
    }).not.toThrow();
  });
});
