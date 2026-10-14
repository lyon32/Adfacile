import { describe, expect, it } from 'vitest';
import { AppError } from '@pubeka/contracts';
import {
  isTokenRevokedError,
  MetaGraphError,
  MetaValidationError,
  parseMetaError,
  toAppError,
  translateFacebookError,
} from './errors';

// Tests portés de backend/src/utils/facebookErrors.test.js (TR-PLA-02).
describe('translateFacebookError', () => {
  it("traduit l'erreur #1815675 rencontrée en production", () => {
    // Erreur réelle : « Publicité non-Messenger dans l'ensemble de publicités Messenger ».
    // Meta la renvoie en sous-code.
    const result = translateFacebookError({
      message: 'Non-Messenger ad in Messenger ad set',
      code: 1487390,
      error_subcode: 1815675,
    });

    expect(result.title).toMatch(/incompatible/i);
    expect(result.message).toMatch(/Messenger/);
    expect(result.fix).toBe('destination');
    expect(result.message).not.toMatch(/Non-Messenger ad in Messenger ad set/);
  });

  it('privilégie le sous-code, plus précis que le code', () => {
    const result = translateFacebookError({ code: 190, error_subcode: 463 });
    expect(result.message).toMatch(/expir/i);
    expect(result.fix).toBe('reconnect');
  });

  it('invite à se reconnecter sur un jeton expiré', () => {
    expect(translateFacebookError({ code: 190 }).fix).toBe('reconnect');
  });

  it('renvoie vers la facturation sur un compte désactivé', () => {
    expect(translateFacebookError({ code: 2635 }).fix).toBe('billing');
  });

  it('conserve le code et le sous-code pour le diagnostic', () => {
    const result = translateFacebookError({ code: 17, error_subcode: 99 });
    expect(result.code).toBe(17);
    expect(result.subcode).toBe(99);
  });

  describe('erreur inconnue', () => {
    it("préfère le message que Meta destine à l'utilisateur", () => {
      const result = translateFacebookError({
        code: 999999,
        message: 'Internal technical detail',
        error_user_title: 'Budget trop faible',
        error_user_msg: 'Augmentez votre budget quotidien.',
      });
      expect(result.title).toBe('Budget trop faible');
      expect(result.message).toBe('Augmentez votre budget quotidien.');
    });

    it('retombe sur le message technique en dernier recours', () => {
      expect(translateFacebookError({ code: 999999, message: 'Something broke' }).message).toBe(
        'Something broke',
      );
    });

    it('ne plante pas sur une erreur vide', () => {
      expect(() => translateFacebookError()).not.toThrow();
      expect(translateFacebookError({}).message).toBeTruthy();
    });
  });

  describe('objectif de performance refusé (Ventes sans pixel)', () => {
    it('explique le pixel manquant au lieu du message générique de Meta', () => {
      const r = translateFacebookError({
        code: 100,
        error_subcode: 2490408,
        message: 'Invalid parameter',
        error_user_msg: 'Vous ne pouvez pas utiliser l’objectif de performance sélectionné.',
      });
      expect(r.message).toMatch(/ensemble de données/);
      expect(r.message).toMatch(/messagerie/);
      expect(r.fix).toBe('destination');
    });
  });

  it("n'utilise pas les propriétés héritées d'Object comme sous-code", () => {
    expect(translateFacebookError({ code: 100, message: 'x' }).fix).toBeNull();
  });
});

describe('parseMetaError', () => {
  it("lit l'objet error d'un corps Graph et ignore les champs de mauvais type", () => {
    expect(
      parseMetaError({ error: { code: 190, error_subcode: '463', message: 'x', fbtrace_id: 'T' } }),
    ).toEqual({
      message: 'x',
      type: undefined,
      code: 190,
      error_subcode: undefined,
      error_user_title: undefined,
      error_user_msg: undefined,
      fbtrace_id: 'T',
    });
  });

  it.each([null, 'texte', 12, {}, { error: null }, { error: 'x' }])(
    'renvoie null pour %j',
    (body) => {
      expect(parseMetaError(body)).toBeNull();
    },
  );

  it('isTokenRevokedError reconnaît le code 190 quel que soit le sous-code', () => {
    expect(isTokenRevokedError({ code: 190, error_subcode: 460 })).toBe(true);
    expect(isTokenRevokedError({ code: 190 })).toBe(true);
    expect(isTokenRevokedError({ code: 100 })).toBe(false);
    expect(isTokenRevokedError(null)).toBe(false);
  });
});

describe('toAppError — codes Pubeka (LLD §6.14)', () => {
  const graph = (code: number, subcode?: number): MetaGraphError =>
    new MetaGraphError({ code, error_subcode: subcode, message: 'détail technique de Meta' }, 400);

  it('jeton révoqué ou expiré → meta_token_expired', () => {
    expect(toAppError(graph(190, 460)).code).toBe('meta_token_expired');
    expect(toAppError(graph(190)).code).toBe('meta_token_expired');
  });

  it('moyen de paiement ou compte désactivé → meta_payment_method_missing', () => {
    expect(toAppError(graph(2635)).code).toBe('meta_payment_method_missing');
  });

  it('autre erreur Meta → meta_error, message traduit dans meta, message d’origine dans cause seulement', () => {
    const err = toAppError(graph(17));
    expect(err.code).toBe('meta_error');
    expect(err.status).toBe(502);
    expect(err.opts.meta).toMatchObject({ fix: 'retry', fbCode: 17 });
    expect(JSON.stringify(err.opts.meta)).not.toContain('détail technique');
    expect(err.cause).toBeInstanceOf(MetaGraphError);
  });

  it('erreur de validation Pubeka → validation_failed avec une entrée par message', () => {
    const err = toAppError(new MetaValidationError('a b', ['a', 'b']));
    expect(err.code).toBe('validation_failed');
    expect(err.opts.errors?.map((e) => e.message)).toEqual(['a', 'b']);
  });

  it('laisse passer une AppError et enveloppe une erreur inconnue en meta_error', () => {
    const own = new AppError('budget_too_low');
    expect(toAppError(own)).toBe(own);
    const unknown = new Error('réseau coupé');
    const wrapped = toAppError(unknown);
    expect(wrapped.code).toBe('meta_error');
    expect(wrapped.cause).toBe(unknown);
  });

  it('MetaValidationError est affichable et garde ses messages (userFacing)', () => {
    const err = new MetaValidationError('texte');
    expect(err.userFacing).toBe(true);
    expect(err.validationErrors).toEqual(['texte']);
  });
});
