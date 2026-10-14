import { describe, expect, it } from 'vitest';
import type { MetaPageContext } from '../types';
import {
  buildPromotedObject,
  instagramIdentity,
  phoneCallToAction,
  resolveDestination,
} from './destination';
import { MetaValidationError } from './errors';

// Tests portés de backend/src/services/facebookAdsService.test.js (TR-PLA-02) : resolveDestination,
// buildPromotedObject, instagramIdentity, phoneCallToAction.
const PAGE: MetaPageContext = {
  id: '799671609906273',
  name: 'Lyon Deals',
  instagramAccountId: null,
  instagramConnected: true,
  whatsappConnected: true,
  whatsappNumber: '+237650198196',
  whatsappPhoneNumberId: null,
};

describe('resolveDestination — site web', () => {
  it('conserve la destination site web et son objectif', () => {
    const result = resolveDestination(
      {
        objective: 'OUTCOME_TRAFFIC',
        destinationType: 'WEBSITE',
        optimizationGoal: 'LANDING_PAGE_VIEWS',
      },
      PAGE,
    );
    expect(result.isMessaging).toBe(false);
    expect(result.destination_type).toBe('WEBSITE');
    expect(result.optimization_goal).toBe('LANDING_PAGE_VIEWS');
  });

  it("déduit l'objectif du type de campagne quand il n'est pas fourni", () => {
    const result = resolveDestination({ objective: 'OUTCOME_TRAFFIC' }, PAGE);
    expect(result.destination_type).toBe('WEBSITE');
    expect(result.optimization_goal).toBe('LINK_CLICKS');
  });

  it('refuse un objectif absent au lieu de retomber sur LINK_CLICKS', () => {
    // Auparavant, un objectif absent ou mal orthographié produisait un ensemble optimisé pour les clics,
    // quelle que soit la campagne.
    expect(() => resolveDestination({ destinationType: 'WEBSITE' }, PAGE)).toThrow(/inconnu/i);
  });

  it("refuse un objectif de performance incompatible avec l'objectif", () => {
    // Le parcours réel : Trafic écrit LANDING_PAGE_VIEWS, l'utilisateur revient en arrière et choisit
    // Notoriété. Meta rejetait l'ensemble APRÈS la création de la campagne.
    expect(() =>
      resolveDestination(
        {
          objective: 'OUTCOME_AWARENESS',
          destinationType: 'WEBSITE',
          optimizationGoal: 'LANDING_PAGE_VIEWS',
        },
        PAGE,
      ),
    ).toThrow(/n'est pas disponible/i);
  });

  it('refuse une campagne Ventes vers un site web sans pixel', () => {
    expect(() =>
      resolveDestination({ objective: 'OUTCOME_SALES', destinationType: 'WEBSITE' }, PAGE),
    ).toThrow(/pixel/i);
  });

  it('accepte Ventes vers un site web dès que le pixel est fourni', () => {
    // Le wizard ne demandait jamais l'ensemble de données : ce chemin échouait donc systématiquement, à
    // la dernière étape.
    const result = resolveDestination(
      { objective: 'OUTCOME_SALES', destinationType: 'WEBSITE', pixelId: '1234567890' },
      PAGE,
    );
    expect(result.optimization_goal).toBe('OFFSITE_CONVERSIONS');
    expect(!result.isMessaging && result.conversion).toEqual({
      pixel_id: '1234567890',
      custom_event_type: 'PURCHASE',
    });
  });

  it("porte le pixel et l'évènement jusqu'au promoted_object", () => {
    const promu = buildPromotedObject('WEBSITE', PAGE, null, null, {
      pixel_id: '1234567890',
      custom_event_type: 'ADD_TO_CART',
    });
    expect(promu).toEqual({ pixel_id: '1234567890', custom_event_type: 'ADD_TO_CART' });
  });

  it('ne fabrique aucun objet promu pour un site web sans pixel', () => {
    expect(buildPromotedObject('WEBSITE', PAGE)).toBeUndefined();
  });

  it('utilise PURCHASE quand le pixel est fourni sans évènement', () => {
    expect(
      buildPromotedObject('WEBSITE', PAGE, null, null, { pixel_id: '9', custom_event_type: '' }),
    ).toEqual({
      pixel_id: '9',
      custom_event_type: 'PURCHASE',
    });
  });
});

describe('resolveDestination — messagerie', () => {
  it("corrige le payload exact qui a produit l'erreur #1815675", () => {
    // Reproduction des logs de production : destination Messenger associée à une optimisation
    // LANDING_PAGE_VIEWS et un bouton de site web.
    const result = resolveDestination(
      { destinationType: 'MESSENGER', optimizationGoal: 'LANDING_PAGE_VIEWS' },
      PAGE,
    );

    expect(result.isMessaging).toBe(true);
    expect(result.destination_type).toBe('MESSENGER');
    // Le point qui faisait tout échouer :
    expect(result.optimization_goal).toBe('CONVERSATIONS');
    expect(result.optimization_goal).not.toBe('LANDING_PAGE_VIEWS');
    expect(result.isMessaging && result.call_to_action.type).toBe('MESSAGE_PAGE');
  });

  it('gère plusieurs applications cochées', () => {
    const result = resolveDestination({ messagingDestinations: ['messenger', 'whatsapp'] }, PAGE);
    expect(result.destination_type).toBe('MESSAGING_MESSENGER_WHATSAPP');
    expect(result.optimization_goal).toBe('CONVERSATIONS');
  });

  it("refuse WhatsApp si aucun numéro n'est relié, avant tout appel à Meta", () => {
    expect(() =>
      resolveDestination(
        { messagingDestinations: ['whatsapp'] },
        { ...PAGE, whatsappConnected: false },
      ),
    ).toThrow(/WhatsApp Business/);
  });

  it("refuse Instagram si aucun compte professionnel n'est relié", () => {
    expect(() =>
      resolveDestination(
        { messagingDestinations: ['instagram'] },
        { ...PAGE, instagramConnected: false },
      ),
    ).toThrow(/Instagram/);
  });

  it("marque l'erreur comme affichable à l'utilisateur", () => {
    try {
      resolveDestination(
        { messagingDestinations: ['instagram'] },
        { ...PAGE, instagramConnected: false },
      );
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(MetaValidationError);
      expect(err).toMatchObject({ userFacing: true, validationErrors: [expect.any(String)] });
    }
  });

  it("transmet le numéro WhatsApp jusqu'au promoted_object", () => {
    // Sans lui, Meta ne sait pas quel numéro promouvoir : le sélecteur de numéro reste vide au niveau
    // de la publicité.
    const result = resolveDestination(
      { messagingDestinations: ['whatsapp'], whatsappPhoneNumber: '+237 6 50 19 81 96' },
      PAGE,
    );
    expect(result.isMessaging && result.whatsapp_phone_number).toBe('237650198196');
    expect(buildPromotedObject('WHATSAPP', PAGE, '237650198196')).toEqual({
      page_id: PAGE.id,
      whatsapp_phone_number: '237650198196',
    });
  });

  it("n'ajoute pas de numéro quand WhatsApp n'est pas visé", () => {
    expect(buildPromotedObject('MESSENGER', { id: '1' })).toEqual({ page_id: '1' });
  });

  it("accepte l'ancien format : un destination_type de messagerie seul", () => {
    const result = resolveDestination({ destinationType: 'WHATSAPP' }, PAGE);
    expect(result.destination_type).toBe('WHATSAPP');
  });
});

describe('buildPromotedObject', () => {
  it('exige la Page pour toutes les destinations de messagerie', () => {
    const sansNumero = { ...PAGE, whatsappNumber: null };
    for (const type of [
      'MESSENGER',
      'WHATSAPP',
      'INSTAGRAM_DIRECT',
      'MESSAGING_MESSENGER_WHATSAPP',
    ]) {
      expect(buildPromotedObject(type, sansNumero)).toEqual({ page_id: PAGE.id });
    }
  });

  it('joint le numéro de la Page quand elle en a un', () => {
    expect(buildPromotedObject('MESSAGING_MESSENGER_WHATSAPP', PAGE)).toEqual({
      page_id: PAGE.id,
      whatsapp_phone_number: '237650198196',
    });
  });

  it("n'ajoute rien pour une destination site web", () => {
    expect(buildPromotedObject('WEBSITE', PAGE)).toBeUndefined();
  });
});

describe('buildPromotedObject — identification du numéro WhatsApp', () => {
  const PAGE_WA = { id: 'P1', whatsappNumber: '+237650198196' };

  it("préfère l'identifiant au numéro brut", () => {
    // Meta rattache alors la publicité au compte WhatsApp Business et en déduit le numéro lui-même.
    expect(buildPromotedObject('WHATSAPP', PAGE_WA, null, '344188022113673')).toEqual({
      page_id: 'P1',
      whats_app_business_phone_number_id: '344188022113673',
    });
  });

  it("n'envoie jamais les deux ensemble", () => {
    // Meta répond « (#200) Permissions error » si les deux sont fournis.
    const result = buildPromotedObject('WHATSAPP', PAGE_WA, '+237650198196', '344188022113673');
    expect(result?.whats_app_business_phone_number_id).toBe('344188022113673');
    expect(result).not.toHaveProperty('whatsapp_phone_number');
  });

  it("retombe sur le numéro quand l'identifiant est absent ou invalide", () => {
    expect(buildPromotedObject('WHATSAPP', PAGE_WA, '+237650198196', '')).toEqual({
      page_id: 'P1',
      whatsapp_phone_number: '237650198196',
    });
    expect(buildPromotedObject('WHATSAPP', PAGE_WA, '+237650198196', 'abc')).toEqual({
      page_id: 'P1',
      whatsapp_phone_number: '237650198196',
    });
  });

  it("lit l'identifiant enregistré sur le compte", () => {
    expect(buildPromotedObject('WHATSAPP', { ...PAGE_WA, whatsappPhoneNumberId: '999' })).toEqual({
      page_id: 'P1',
      whats_app_business_phone_number_id: '999',
    });
  });
});

describe('instagramIdentity — destination « Instagram ou Facebook »', () => {
  // Relevé réel (8 oct. 2026, test T3) : Meta refusait la publicité INSTAGRAM_PROFILE (sous-code 3907008,
  // « doit être associée à un compte Instagram ») — le compte Instagram relié n'était jamais transmis.
  it('transmet le compte Instagram relié pour INSTAGRAM_PROFILE', () => {
    expect(
      instagramIdentity('INSTAGRAM_PROFILE', { instagramAccountId: '17841400000000000' }),
    ).toEqual({
      instagram_user_id: '17841400000000000',
    });
  });

  it("refuse avant tout appel Meta si aucun compte Instagram n'est relié", () => {
    expect(() => instagramIdentity('INSTAGRAM_PROFILE', { instagramAccountId: null })).toThrow(
      /compte Instagram/,
    );
  });

  it('ne change rien aux autres destinations', () => {
    expect(instagramIdentity('WEBSITE', { instagramAccountId: '1' })).toEqual({});
  });
});

describe('phoneCallToAction — destination « Appels »', () => {
  // Relevé réel (8 oct. 2026, test T4) : la publicité d'appel partait avec « En savoir plus » vers le
  // site — personne ne pouvait appeler. Meta exige CALL_NOW avec un lien tel: (doc « Call Ads »).
  it('construit CALL_NOW avec un lien tel: au format international', () => {
    expect(phoneCallToAction('+237 6 99 00 00 00')).toEqual({
      type: 'CALL_NOW',
      value: { link: 'tel:+237699000000' },
    });
  });

  it('refuse un numéro sans indicatif pays, avant tout appel Meta', () => {
    expect(() => phoneCallToAction('699000000')).toThrow(/indicatif/);
    expect(() => phoneCallToAction('')).toThrow(/numéro/);
    expect(() => phoneCallToAction(undefined)).toThrow(/numéro/);
  });
});
