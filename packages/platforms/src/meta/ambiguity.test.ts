import { AppError } from '@pubeka/contracts';
import { describe, expect, it } from 'vitest';
import { isAmbiguousMetaFailure, MetaGraphError, MetaValidationError, toAppError } from './errors';

// EC-META-05 : après une erreur, la tâche doit savoir si Meta A PEUT AVOIR créé quelque chose (résultat incertain : on
// cherche chez Meta avant de conclure) ou si Meta a clairement refusé (rien n'a été créé : échec définitif).
// Codes 1, 2 et 341 = panne temporaire de Meta (https://developers.facebook.com/docs/graph-api/guides/error-handling) : la
// documentation ne dit pas si l'opération a pu aboutir en partie → incertain. Codes 4 et 17 = limitation de débit → refus net.
const graph = (code: number | undefined, status = 400) =>
  toAppError(new MetaGraphError({ code, message: 'x' }, status));

describe('isAmbiguousMetaFailure — un refus clair de Meta n’est pas incertain', () => {
  it.each([
    ['budget trop bas', new AppError('budget_too_low')],
    ['validation Pubeka', toAppError(new MetaValidationError('x'))],
    ['jeton expiré', new AppError('meta_token_expired')],
    ['moyen de paiement manquant', new AppError('meta_payment_method_missing')],
    ['erreur 100 « paramètre invalide »', graph(100)],
    ['erreur 200 « permissions »', graph(200)],
    ['erreur 4 « trop d’appels » (limitation)', graph(4, 400)],
    ['erreur 17 « trop d’appels par utilisateur »', graph(17, 400)],
    ['erreur 3 (capacité manquante)', graph(3)],
    ['HTTP 403', graph(undefined, 403)],
    ['HTTP 429', graph(undefined, 429)],
  ])('%s → refus net', (_name, error) => {
    expect(isAmbiguousMetaFailure(error)).toBe(false);
  });
});

describe('isAmbiguousMetaFailure — tout ce qui laisse un doute est incertain', () => {
  it.each([
    [
      'délai dépassé',
      new AppError('meta_error', { cause: new DOMException('timeout', 'TimeoutError') }),
    ],
    ['connexion coupée', new AppError('meta_error', { cause: new TypeError('fetch failed') })],
    [
      'réponse illisible',
      new AppError('meta_error', { cause: new SyntaxError('Unexpected token') }),
    ],
    [
      'pas d’identifiant dans la réponse',
      new AppError('meta_error', {
        cause: new Error("Facebook n'a pas renvoyé d'identifiant pour la campagne."),
      }),
    ],
    ['erreur sans cause', new AppError('meta_error')],
    ['erreur 1 « inconnue »', graph(1)],
    ['erreur 2 « service indisponible »', graph(2)],
    ['erreur 341 « panne temporaire »', graph(341)],
    ['HTTP 500', graph(undefined, 500)],
    ['HTTP 502', graph(100, 502)],
    ['HTTP 503', graph(undefined, 503)],
    ['HTTP 504', graph(undefined, 504)],
  ])('%s → incertain', (_name, error) => {
    expect(isAmbiguousMetaFailure(error)).toBe(true);
  });

  it('une erreur qui n’est pas une AppError (délai brut, exception) est incertaine', () => {
    expect(isAmbiguousMetaFailure(new DOMException('timeout', 'TimeoutError'))).toBe(true);
    expect(isAmbiguousMetaFailure(new TypeError('fetch failed'))).toBe(true);
    expect(isAmbiguousMetaFailure('bizarre')).toBe(true);
    expect(isAmbiguousMetaFailure(undefined)).toBe(true);
  });

  it('une erreur Pubeka interne sans lien avec Meta (base, configuration) n’est pas un résultat incertain chez Meta', () => {
    expect(isAmbiguousMetaFailure(new AppError('internal_error'))).toBe(false);
    expect(isAmbiguousMetaFailure(new AppError('provider_unavailable'))).toBe(false);
  });
});
