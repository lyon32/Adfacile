// Monde en mémoire pour les tests unitaires des campagnes : un espace, son propriétaire, une Page, une analyse prête, la TVA et
// le change D'ESSAI (valeurs de test, pas des données du produit). Les contraintes de la vraie base sont prouvées par
// PGlite et par les tests d'intégration.
import { MemoryDb } from '../analysis/memory-db.test-helper';
import type { MemberCtx, MemberRole, WorkspaceAccess } from '../context';

export const NOW = new Date('2026-10-12T09:00:00Z');
export const W = '00000000-0000-4000-8000-0000000000a1';
export const OWNER = '00000000-0000-4000-8000-0000000000b1';
export const PAGE = '00000000-0000-4000-8000-0000000000c1';
export const ANALYSIS = '00000000-0000-4000-8000-0000000000d1';
export const OTHER_W = '00000000-0000-4000-8000-0000000000a2';

export function world(
  options: { role?: MemberRole; access?: WorkspaceAccess; analysisStatus?: string } = {},
) {
  const db = new MemoryDb();
  db.rules.campaigns = { bumpVersion: true };
  db.rules.campaign_proposals = {
    unique: [
      ['campaign_id', 'version'],
      ['campaign_id', 'idempotency_key'],
    ],
  };
  db.rows('workspaces').push({ id: W, owner_id: OWNER });
  db.rows('profiles').push({ id: OWNER, country_code: 'CM' });
  db.rows('countries').push({ code: 'CM', currency: 'XAF' });
  db.rows('vat_rates').push({ country_code: 'CM', rate: 0.1925, valid_from: '2020-01-01' });
  db.rows('exchange_rates').push({
    base: 'USD',
    quote: 'XAF',
    rate: 600,
    source: 'manual',
    fetched_at: '2026-10-10T00:00:00Z',
  });
  db.rows('pages').push({
    id: PAGE,
    workspace_id: W,
    ad_language: 'fr',
    ad_address: 'vous',
    whatsapp_linked: true,
    instagram_account_id: null,
    pixel_ids: ['123456789012'],
  });
  db.rows('ad_accounts').push({ id: 'ad1', workspace_id: W, is_active: true, vat_country: null });
  db.rows('business_profiles').push({
    id: 'bp1',
    workspace_id: W,
    profile: {
      business_name: { value: 'Sneakers Cocody', source: 0 },
      locations: [{ country: 'CI', city: 'Abidjan', area: 'Cocody', delivery: true }],
      products: [{ name: 'Baskets', price: { amount: 25000, currency: 'XOF' } }],
    },
    questions: [{ id: 'q1', text: 'Sur quel numéro WhatsApp ?' }],
    answers: [{ question_id: 'q1', answer: '+225 07 07 07 07 07' }],
  });
  db.rows('analyses').push({
    id: ANALYSIS,
    workspace_id: W,
    status: options.analysisStatus ?? 'ready',
    business_profile_id: 'bp1',
    user_intent: null,
  });
  const ctx: MemberCtx = {
    requestId: 'req_TEST',
    user: { id: OWNER, email: 'awa@example.com', locale: 'fr', timezone: 'Africa/Douala' },
    db: db.asDb(),
    svc: db.asService(),
    now: () => NOW,
    workspace: { id: W, role: options.role ?? 'owner', access: options.access ?? 'active' },
  };
  return { db, ctx };
}

/** Un brouillon déjà en base (version 1). */
export function addDraft(db: MemoryDb, over: Record<string, unknown> = {}): string {
  const id = db.nextId();
  db.rows('campaigns').push({
    id,
    workspace_id: W,
    page_id: PAGE,
    ad_account_id: 'ad1',
    analysis_id: ANALYSIS,
    name: 'Brouillon',
    version: 1,
    status: 'draft',
    editable: true,
    platform: 'meta',
    geo: {},
    targeting: {},
    copy: {},
    tracking: null,
    ab_test: false,
    daily_budget_usd_cents: null,
    start_date: null,
    end_date: null,
    objective: null,
    destination: null,
    optimization_goal: null,
    visual_brief: null,
    vat_rate: null,
    fx_rate_xaf: null,
    published_at: null,
    chosen_proposal_version: null,
    ...over,
  });
  return id;
}
