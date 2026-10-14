// Validation de l'adresse de retour OAuth : portée de backend/src/config/facebook.test.js (AdFacile).
import { describe, expect, it } from 'vitest';
import { META_CALLBACK_PATH, metaRedirectUri, validateMetaRedirectUri } from './redirect-uri';

const VALID = `https://app.pubeka.com${META_CALLBACK_PATH}`;

describe('validateMetaRedirectUri', () => {
  it('accepte une configuration HTTPS complète', () => {
    expect(validateMetaRedirectUri(VALID)).toEqual({ valid: true, errors: [], warnings: [] });
  });

  it.each([
    `http://localhost:5173${META_CALLBACK_PATH}`,
    `http://127.0.0.1:5173${META_CALLBACK_PATH}`,
    `http://[::1]:5173${META_CALLBACK_PATH}`,
    `http://app.localhost:5173${META_CALLBACK_PATH}`,
  ])('accepte http:// en développement (%s) sans avertir', (uri) => {
    expect(validateMetaRedirectUri(uri).warnings).toEqual([]);
    expect(validateMetaRedirectUri(uri).valid).toBe(true);
  });

  it('signale une adresse absente ou vide', () => {
    expect(validateMetaRedirectUri(undefined).valid).toBe(false);
    expect(validateMetaRedirectUri('').errors.join(' ')).toContain('absente');
  });

  it("rejette une adresse qui n'est pas une URL absolue", () => {
    const result = validateMetaRedirectUri(META_CALLBACK_PATH);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('URL absolue');
  });

  it('rejette une adresse dont le chemin ne correspond pas à la route du callback', () => {
    const result = validateMetaRedirectUri('https://exemple.com/mauvais/chemin');
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain(META_CALLBACK_PATH);
  });

  it('rejette l’ancien chemin AdFacile', () => {
    expect(validateMetaRedirectUri('https://exemple.com/api/facebook/callback').valid).toBe(false);
  });

  it('avertit sur http:// hors développement : la configuration que Meta rejette', () => {
    const result = validateMetaRedirectUri(`http://app.pubeka.com${META_CALLBACK_PATH}`);
    expect(result.valid).toBe(true);
    expect(result.warnings.join(' ')).toContain('https://');
  });
});

describe('metaRedirectUri', () => {
  it("ajoute le chemin du callback à l'adresse de l'application, sans double barre", () => {
    expect(metaRedirectUri('https://app.pubeka.com/')).toBe(VALID);
    expect(metaRedirectUri('http://app.localhost:5173')).toBe(
      `http://app.localhost:5173${META_CALLBACK_PATH}`,
    );
  });
});
