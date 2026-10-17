import { AppError } from '@pubeka/contracts';
import { describe, expect, it } from 'vitest';
import { buildPublishSpec, type SpecInput } from './build-spec';

// Valeurs d'ESSAI (aucune donnée du produit).
const REF = 'pk-0123456789ab-1';

function input(
  over: Partial<SpecInput> = {},
  campaign: Partial<SpecInput['campaign']> = {},
): SpecInput {
  return {
    campaign: {
      name: 'Promo baskets',
      objective: 'OUTCOME_ENGAGEMENT',
      destination: 'WHATSAPP',
      optimization_goal: 'CONVERSATIONS',
      geo: { countries: ['CM'] },
      targeting: { age_min: 20, age_max: 45, genders: 'female', advantage_plus: true },
      daily_budget_usd_cents: 500,
      start_date: '2026-10-14',
      end_date: '2026-10-20',
      copy: {
        primary_text: 'Des baskets neuves.',
        headline: 'Baskets à prix doux',
        description: 'Livraison',
        cta: 'SEND_WHATSAPP_MESSAGE',
      },
      tracking: null,
      ...campaign,
    },
    ref: REF,
    page: {
      id: 'p1',
      metaPageId: '200000000001',
      name: 'Ma Boutique',
      active: true,
      instagramAccountId: null,
      whatsappLinked: true,
      whatsappNumber: '+237650198196',
      pixelIds: ['123456789012'],
    },
    adAccount: {
      id: 'a1',
      metaAdAccountId: 'act_100000000001',
      currency: 'USD',
      hasPaymentMethod: true,
      name: 'Compte',
      connectionId: 'c1',
    },
    account: { code: 'USD' },
    website: 'https://sneakers.example',
    mediaUrl: 'https://storage.test/sources/x.jpg?token=t',
    locations: [{ key: 'CM', type: 'country', countryCode: 'CM' }],
    ...over,
  };
}

describe('buildPublishSpec — champs communs', () => {
  it('nomme la campagne avec la référence de rapprochement (EC-META-05)', () => {
    const spec = buildPublishSpec(input());
    expect(spec.campaignName).toBe(`Promo baskets [${REF}]`);
  });

  it('reprend objectif, compte, dates, budget en centimes de dollar et monnaie du compte', () => {
    const spec = buildPublishSpec(input({ account: { code: 'NGN', perUsd: 1500 } }));
    expect(spec).toMatchObject({
      objective: 'OUTCOME_ENGAGEMENT',
      adAccountId: 'act_100000000001',
      account: { code: 'NGN', perUsd: 1500 },
      dailyBudgetUsdCents: 500,
      startDate: '2026-10-14',
      endDate: '2026-10-20',
      optimizationGoal: 'CONVERSATIONS',
    });
  });

  it('décrit la Page : identifiant Meta, nom, WhatsApp relié et son numéro, Instagram absent', () => {
    expect(buildPublishSpec(input()).page).toEqual({
      id: '200000000001',
      name: 'Ma Boutique',
      instagramAccountId: null,
      instagramConnected: false,
      whatsappConnected: true,
      whatsappNumber: '+237650198196',
      whatsappPhoneNumberId: null,
    });
  });

  it('le ciblage est automatique (Advantage+) avec âge et genre de la proposition ; « tous » ne filtre pas le genre', () => {
    const spec = buildPublishSpec(input());
    expect(spec.targeting).toMatchObject({
      ageMin: 20,
      ageMax: 45,
      genders: ['female'],
      advantageAudience: 1,
    });
    expect(spec.targeting.interests).toBeUndefined();
    const all = buildPublishSpec(input({}, { targeting: { genders: 'all' } }));
    expect(all.targeting.genders).toBeUndefined();
    expect(all.targeting.advantageAudience).toBe(1);
  });

  it('Advantage+ désactivé explicitement : 0', () => {
    const spec = buildPublishSpec(input({}, { targeting: { advantage_plus: false } }));
    expect(spec.targeting.advantageAudience).toBe(0);
  });

  it('la photo téléversée est le visuel de la pub (image), avec texte, titre et description', () => {
    const spec = buildPublishSpec(input());
    expect(spec.creative).toMatchObject({
      mediaType: 'image',
      mediaUrl: 'https://storage.test/sources/x.jpg?token=t',
      message: 'Des baskets neuves.',
      headline: 'Baskets à prix doux',
      description: 'Livraison',
    });
  });
});

describe('buildPublishSpec — destination', () => {
  it.each([
    ['WHATSAPP', ['whatsapp']],
    ['MESSENGER', ['messenger']],
    ['INSTAGRAM_DIRECT', ['instagram']],
  ] as const)('%s : application de messagerie %j, sans lien de site', (destination, apps) => {
    const spec = buildPublishSpec(input({}, { destination }));
    expect(spec.messagingDestinations).toEqual(apps);
    expect(spec.destinationType).toBeUndefined();
    expect(spec.websiteUrl).toBeUndefined();
  });

  it('SITE : destination WEBSITE, lien de la fiche du commerce, bouton choisi par la proposition', () => {
    const spec = buildPublishSpec(
      input(
        {},
        {
          objective: 'OUTCOME_TRAFFIC',
          destination: 'WEBSITE',
          optimization_goal: 'LINK_CLICKS',
          copy: { primary_text: 'x', headline: 'y', cta: 'SHOP_NOW' },
        },
      ),
    );
    expect(spec).toMatchObject({
      destinationType: 'WEBSITE',
      websiteUrl: 'https://sneakers.example',
      creative: { link: 'https://sneakers.example', callToAction: 'SHOP_NOW' },
    });
    expect(spec.messagingDestinations).toBeUndefined();
  });

  it('SITE sans adresse dans la fiche : refus clair avant tout appel', () => {
    expect(() =>
      buildPublishSpec(
        input(
          { website: null },
          {
            objective: 'OUTCOME_TRAFFIC',
            destination: 'WEBSITE',
            optimization_goal: 'LINK_CLICKS',
          },
        ),
      ),
    ).toThrow(AppError);
  });

  it('NOTORIÉTÉ (NONE) : lien vers la Page, destination non définie', () => {
    const spec = buildPublishSpec(
      input(
        {},
        { objective: 'OUTCOME_AWARENESS', destination: 'NONE', optimization_goal: 'REACH' },
      ),
    );
    expect(spec.destinationType).toBe('UNDEFINED');
    expect(spec.creative.link).toBe('https://www.facebook.com/200000000001');
  });

  it.each(['APP', 'ON_POST'] as const)(
    '%s : non prise en charge à la publication',
    (destination) => {
      expect(() => buildPublishSpec(input({}, { destination }))).toThrow(AppError);
    },
  );
});

describe('buildPublishSpec — pixel', () => {
  it('le pixel n’est transmis que pour une optimisation sur les conversions (Ventes)', () => {
    const sales = buildPublishSpec(
      input(
        {},
        {
          objective: 'OUTCOME_SALES',
          destination: 'WEBSITE',
          optimization_goal: 'OFFSITE_CONVERSIONS',
          tracking: { pixel_id: '123456789012' },
        },
      ),
    );
    expect(sales.pixelId).toBe('123456789012');
    const traffic = buildPublishSpec(
      input(
        {},
        {
          objective: 'OUTCOME_TRAFFIC',
          destination: 'WEBSITE',
          optimization_goal: 'LINK_CLICKS',
          tracking: { pixel_id: '123456789012' },
        },
      ),
    );
    expect(traffic.pixelId).toBeUndefined();
  });
});

describe('buildPublishSpec — lieux', () => {
  it('transmet les lieux résolus tels quels (rayon de chaque ville compris)', () => {
    const locations = [{ key: '2447439', type: 'city', countryCode: 'CM', radiusKm: 10 }];
    expect(buildPublishSpec(input({ locations })).targeting.locations).toEqual(locations);
  });

  it('refuse une campagne sans aucun lieu', () => {
    expect(() => buildPublishSpec(input({ locations: [] }))).toThrow(AppError);
  });
});

describe('buildPublishSpec — données manquantes', () => {
  it.each([
    ['objective', { objective: null }],
    ['destination', { destination: null }],
    ['budget', { daily_budget_usd_cents: null }],
    ['début', { start_date: null }],
    ['fin', { end_date: null }],
    ['texte', { copy: {} }],
  ] as const)('refuse sans %s (validation_failed)', (_name, campaign) => {
    expect(() => buildPublishSpec(input({}, campaign))).toThrow(AppError);
  });

  it('un nom de plus de 200 caractères reste sous les 255 de Meta avec la référence', () => {
    const spec = buildPublishSpec(input({}, { name: 'x'.repeat(200) }));
    expect(spec.campaignName.length).toBeLessThanOrEqual(255);
    expect(spec.campaignName.endsWith(`[${REF}]`)).toBe(true);
  });
});

describe('buildPublishSpec — sans image (estimation de portée)', () => {
  it('sans adresse de photo, la création est sans média (jamais une adresse inventée)', () => {
    const spec = buildPublishSpec(input({ mediaUrl: null }));
    expect(spec.creative.mediaType).toBe('none');
    expect(spec.creative.mediaUrl).toBeUndefined();
  });
});
