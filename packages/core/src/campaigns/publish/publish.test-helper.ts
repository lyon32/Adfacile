// Monde en mémoire pour les tests de publication : un espace avec abonnement, une Page active, un compte publicitaire relié,
// une connexion Meta valide, une photo téléversée et une campagne complète prête à publier. Les valeurs (taux, budgets,
// identifiants) sont des valeurs D'ESSAI, jamais des valeurs du produit. Les contraintes de la vraie base sont prouvées par
// PGlite et par les tests d'intégration.
import type { AppError } from '@pubeka/contracts';
import type { JobEnqueuer } from '../../analysis/deps';
import type { MemoryDb } from '../../analysis/memory-db.test-helper';
import type { MemberCtx } from '../../context';
import { addDraft, NOW, PAGE, W, world } from '../campaigns.test-helper';
import type { PublishCampaignDeps } from './publish-types';

export const AD_ROW = 'ad1';
export const CONN = '00000000-0000-4000-8000-0000000000e1';
export const SOURCE = '00000000-0000-4000-8000-0000000000f1';
export const PHOTO_PATH = `${W}/11111111-1111-4111-8111-111111111111.jpg`;
export const META_AD_ACCOUNT = 'act_100000000001';
export const KEY_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const KEY_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const PERIOD_END = '2026-11-01T00:00:00.000Z';

export interface EnqueuedJob {
  taskId: string;
  payload: unknown;
  key: string;
}

export class RecordingJobs implements JobEnqueuer {
  readonly jobs: EnqueuedJob[] = [];
  /** Une clé déjà vue n'est pas relancée, comme le vrai lanceur (clé d'idempotence). */
  private readonly seen = new Set<string>();
  failWith: Error | undefined;
  enqueue(taskId: string, payload: unknown, key: string): Promise<void> {
    if (this.failWith !== undefined) return Promise.reject(this.failWith);
    if (!this.seen.has(`${taskId}:${key}`)) {
      this.seen.add(`${taskId}:${key}`);
      this.jobs.push({ taskId, payload, key });
    }
    return Promise.resolve();
  }
}

export class RecordingHooks {
  readonly events: string[] = [];
  refuseWith: AppError | undefined;
  beforeSpend = (campaignId: string, workspaceId: string): Promise<void> => {
    this.events.push(`beforeSpend:${campaignId}:${workspaceId}`);
    return this.refuseWith === undefined ? Promise.resolve() : Promise.reject(this.refuseWith);
  };
  afterAccepted = (campaignId: string, workspaceId: string): Promise<void> => {
    this.events.push(`afterAccepted:${campaignId}:${workspaceId}`);
    return Promise.resolve();
  };
  release = (campaignId: string, workspaceId: string): Promise<void> => {
    this.events.push(`release:${campaignId}:${workspaceId}`);
    return Promise.resolve();
  };
  count(kind: 'beforeSpend' | 'afterAccepted' | 'release'): number {
    return this.events.filter((e) => e.startsWith(`${kind}:`)).length;
  }
}

export interface PublishWorld {
  db: MemoryDb;
  ctx: MemberCtx;
  jobs: RecordingJobs;
  hooks: RecordingHooks;
  deps: PublishCampaignDeps;
  /** Un brouillon complet, prêt à publier. */
  campaignId: string;
}

export function publishWorld(
  options: Parameters<typeof world>[0] & { draft?: Record<string, unknown> } = {},
): PublishWorld {
  const { db, ctx } = world(options);
  db.rules.campaigns = { bumpVersion: true, unique: [['workspace_id', 'publish_ref']] };
  db.rules.publish_liability_acceptances = { unique: [['workspace_id']] };
  db.rows('plans').push(
    { code: 'starter', max_members: 1, max_pages: 1, campaigns_per_period: 3 },
    { code: 'pro', max_members: 3, max_pages: 3, campaigns_per_period: 10 },
  );
  db.rows('subscriptions').push({
    workspace_id: W,
    plan_code: 'pro',
    status: 'active',
    period_start: '2026-10-01T00:00:00.000Z',
    period_end: PERIOD_END,
    grace_until: null,
    created_at: '2026-10-01T00:00:00.000Z',
  });
  const page = db.rows('pages').find((p) => p.id === PAGE);
  if (page !== undefined) {
    Object.assign(page, {
      meta_page_id: '200000000001',
      name: 'Ma Boutique',
      active: true,
      whatsapp_number: '+237650198196',
    });
  }
  Object.assign(db.rows('ad_accounts')[0] ?? {}, {
    id: AD_ROW,
    name: 'Compte de test',
    meta_ad_account_id: META_AD_ACCOUNT,
    currency: 'USD',
    has_payment_method: true,
    meta_connection_id: CONN,
  });
  db.rows('meta_connections').push({
    id: CONN,
    workspace_id: W,
    status: 'ok',
    expires_at: '2026-12-31T00:00:00.000Z',
  });
  const profile = db.rows('business_profiles')[0];
  if (profile !== undefined) {
    profile.profile = {
      business_name: { value: 'Sneakers Cocody', source: 0 },
      contacts: { website: 'https://sneakers.example', whatsapp: '+237650198196' },
    };
  }
  const analysis = db.rows('analyses')[0];
  if (analysis !== undefined) analysis.source_ids = [SOURCE];
  db.rows('sources').push({
    id: SOURCE,
    workspace_id: W,
    type: 'image',
    file_path: PHOTO_PATH,
    status: 'ok',
    expires_at: null,
    created_at: '2026-10-11T10:00:00.000Z',
  });
  db.put('sources', PHOTO_PATH, new Uint8Array([1, 2, 3]));
  const campaignId = addDraft(db, {
    name: 'Promo baskets',
    objective: 'OUTCOME_ENGAGEMENT',
    destination: 'WHATSAPP',
    optimization_goal: 'CONVERSATIONS',
    geo: { countries: ['CM'] },
    targeting: { advantage_plus: true },
    copy: {
      primary_text: 'Des baskets neuves à Douala.',
      headline: 'Baskets à prix doux',
      cta: 'SEND_WHATSAPP_MESSAGE',
    },
    daily_budget_usd_cents: 500,
    start_date: '2026-10-14',
    end_date: '2026-10-20',
    ...options.draft,
  });
  const jobs = new RecordingJobs();
  const hooks = new RecordingHooks();
  return {
    db,
    ctx,
    jobs,
    hooks,
    deps: {
      jobs,
      metaPublishEnabled: () => true,
      beforeSpend: hooks.beforeSpend,
      afterAccepted: hooks.afterAccepted,
      release: hooks.release,
    },
    campaignId,
  };
}

export function rowOf(db: MemoryDb, id: string): Record<string, unknown> {
  const row = db.rows('campaigns').find((r) => r.id === id);
  if (row === undefined) throw new Error(`campagne ${id} absente`);
  return row;
}

export { NOW };
