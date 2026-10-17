// Les dépendances de la tâche et de la pause/reprise/relance reçoivent l'interrupteur de publication réelle construit depuis
// l'environnement : préproduction (Meta RÉEL, faux services sans `meta`) désactivée par défaut ; fausse Meta jamais bloquée.
import { parseEnv, type EnvSource } from '@pubeka/shared';
import { describe, expect, it } from 'vitest';
import { createCampaignControlDeps, createRunPublicationDeps } from './publish-deps';

// Valeurs factices de la seule forme attendue : aucun vrai secret.
const KEY_32 = Buffer.alloc(32, 7).toString('base64');

function env(overrides: EnvSource = {}) {
  return parseEnv({
    NEXT_PUBLIC_APP_ENV: 'preview',
    NEXT_PUBLIC_SITE_URL: 'http://localhost:5173',
    NEXT_PUBLIC_APP_URL: 'http://app.localhost:5173',
    SITE_HOSTS: 'localhost:5173',
    ADMIN_PATH: 'a'.repeat(32),
    APP_SIGNING_SECRET: KEY_32,
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_factice',
    SUPABASE_SECRET_KEY: 'sb_secret_factice',
    TOKEN_ENCRYPTION_KEYS: JSON.stringify({ k1: KEY_32 }),
    TOKEN_ENCRYPTION_ACTIVE_KEY_ID: 'k1',
    PUBEKA_JOB_DISPATCH: 'inline',
    META_APP_ID: '123456789',
    META_APP_SECRET: 'ab'.repeat(16),
    ...overrides,
  });
}

const now = () => new Date('2026-10-17T10:00:00Z');
const builders = [
  ['tâche campaign.publish', createRunPublicationDeps],
  ['pause / reprise / relance', createCampaignControlDeps],
] as const;

describe.each(builders)('%s — interrupteur construit depuis l’environnement', (_name, build) => {
  it('préproduction : Meta RÉEL (faux services sans meta), interrupteur absent → DÉSACTIVÉ', () => {
    const deps = build(env({ PUBEKA_FAKE_PROVIDERS: 'saspay,media,ai,email' }), now);
    expect(deps.metaPublishEnabled()).toBe(false);
  });

  it('aucun faux service et interrupteur absent ou différent de « enabled » → DÉSACTIVÉ', () => {
    expect(build(env(), now).metaPublishEnabled()).toBe(false);
    expect(build(env({ PUBEKA_META_PUBLISH: 'true' }), now).metaPublishEnabled()).toBe(false);
  });

  it('« enabled » (réglé par le chef de projet) → activé', () => {
    expect(build(env({ PUBEKA_META_PUBLISH: 'enabled' }), now).metaPublishEnabled()).toBe(true);
  });

  it('fausse Meta (all, ou liste avec meta) : jamais bloquée, sans interrupteur', () => {
    expect(build(env({ PUBEKA_FAKE_PROVIDERS: 'all' }), now).metaPublishEnabled()).toBe(true);
    expect(build(env({ PUBEKA_FAKE_PROVIDERS: 'meta,saspay' }), now).metaPublishEnabled()).toBe(
      true,
    );
  });
});
