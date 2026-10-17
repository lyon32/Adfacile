// Interrupteur de sécurité de la publication réelle (S16) : `PUBEKA_META_PUBLISH=enabled` est exigé quand Meta est RÉEL ; la fausse
// Meta (PUBEKA_FAKE_PROVIDERS contenant `meta`, ou `all`) ne dépense rien et n'a pas besoin de l'interrupteur.
import { AppError } from '@pubeka/contracts';
import { describe, expect, it } from 'vitest';
import {
  assertMetaPublishEnabled,
  metaPublishAllowed,
  publishDisabledError,
} from './publish-switch';

const env = (fake?: string, publish?: string) => ({
  PUBEKA_FAKE_PROVIDERS: fake as 'all' | undefined,
  PUBEKA_META_PUBLISH: publish,
});

describe('metaPublishAllowed — Meta réel : désactivé sauf la valeur exacte « enabled »', () => {
  it.each([
    ['absent', undefined],
    ['vide', ''],
    ['majuscules', 'ENABLED'],
    ['true', 'true'],
    ['1', '1'],
    ['oui', 'oui'],
    ['espaces autour', ' enabled '],
    ['disabled', 'disabled'],
  ])('%s : désactivé', (_name, value) => {
    expect(metaPublishAllowed(env(undefined, value))).toBe(false);
  });

  it('« enabled » : autorisé', () => {
    expect(metaPublishAllowed(env(undefined, 'enabled'))).toBe(true);
  });

  it('préproduction : faux services SANS meta (saspay,media,ai,email) et sans interrupteur : désactivé', () => {
    expect(metaPublishAllowed(env('saspay,media,ai,email'))).toBe(false);
    expect(metaPublishAllowed(env('saspay,media,ai,email', 'non'))).toBe(false);
  });

  it('faux services sans meta mais interrupteur « enabled » : autorisé (le chef de projet l’a décidé)', () => {
    expect(metaPublishAllowed(env('saspay,media,ai,email', 'enabled'))).toBe(true);
  });
});

describe('metaPublishAllowed — fausse Meta : l’interrupteur n’est pas exigé', () => {
  it.each(['all', 'meta', 'meta,saspay', 'saspay, meta'])('PUBEKA_FAKE_PROVIDERS=%s', (fake) => {
    expect(metaPublishAllowed(env(fake))).toBe(true);
    expect(metaPublishAllowed(env(fake, 'disabled'))).toBe(true);
  });
});

describe('assertMetaPublishEnabled', () => {
  it('désactivé : provider_unavailable (503) avec meta.reason = publish_disabled', () => {
    let caught: unknown;
    try {
      assertMetaPublishEnabled({ metaPublishEnabled: () => false });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    expect((caught as AppError).code).toBe('provider_unavailable');
    expect((caught as AppError).opts.meta).toMatchObject({ reason: 'publish_disabled' });
    expect(publishDisabledError().code).toBe('provider_unavailable');
  });

  it('activé : ne lève rien', () => {
    expect(() => {
      assertMetaPublishEnabled({ metaPublishEnabled: () => true });
    }).not.toThrow();
  });
});
