// Pause de TOUTES les publicités d'un espace (S19b, TR-PAY-07, EC-PAY-11). Un seul moteur, deux déclencheurs :
//  - la route `POST /campaigns/pause-all` (bouton « Mettre toutes mes publicités en pause » de l'écran verrouillé) ;
//  - la tâche planifiée `campaign.lock-pause` (fin de la grâce de 3 jours, ou fin d'un essai sans abonnement).
//
// Règles, dans l'ordre où elles comptent :
//  1. META D'ABORD, ET CONFIRMÉ. Une campagne n'est marquée « en pause » dans Pubeka que si Meta le DIT : après l'ordre de pause on
//     RELIT le statut chez Meta. Un ordre qui échoue (jeton expiré, réseau) mais dont la relecture montre la campagne en pause est
//     accepté ; un ordre accepté dont la relecture ne montre pas « en pause » n'est PAS marqué (EC-META-07 : jamais de faux succès).
//  2. REJOUABLE SANS DOUBLE EFFET. Mettre en pause est idempotent chez Meta et la transition locale est gardée par le statut lu
//     (`applyTransition`) : deux processus qui se croisent, un seul écrit, un seul événement. Contrairement à une dépense, un nouvel
//     essai à la passe suivante est sans danger (la pause ne dépense rien).
//  3. LIMITES DE DÉBIT (EC-META-10). Budget de campagnes par passage ; limite de l'application = on arrête tout, limite d'un compte
//     publicitaire = on saute ses autres campagnes ; la passe suivante reprend.
//  4. AUCUNE REPRISE ICI. La reprise est toujours manuelle (`resume-locked.ts`). L'interrupteur `PUBEKA_META_PUBLISH` ne bloque jamais
//     la pause : elle ARRÊTE la dépense.
//  5. Le motif `billing_lock` est posé SEULEMENT pour les campagnes que ce passage a réellement mises en pause : une campagne que le
//     client avait déjà mise en pause n'est pas touchée et n'aura donc jamais ce motif (donc jamais reprise par « Reprendre mes pubs »).
import { AppError } from '@pubeka/contracts';
import { unwrap } from '@pubeka/db';
import {
  toAppError,
  type PlatformConnector,
  type PlatformCampaignRefs,
  type PlatformStatus,
  type PlatformToken,
} from '@pubeka/platforms';
import { createLogger } from '@pubeka/shared';
import type { ServiceCtx } from '../../context';
import { nextCampaignStatus } from '../campaign-state';
import { loadPublishInputs } from '../publish/load-inputs';
import { loadPublishRow } from '../publish/publish-row';
import { loadRefs } from '../publish/remote-refs';
import type { RunPublicationDeps } from '../publish/run-publication';
import { applyTransition, recordStatusEvent } from '../publish/transitions';
import { metaRateLimitScope } from '../sync/meta-limits';

const logger = createLogger({ base: { module: 'lock-pause' } });

/** Motif posé sur les campagnes que le verrouillage a mises en pause (colonne `campaigns.pause_reason`, migration 0022). */
export const BILLING_LOCK_REASON = 'billing_lock';
export type PauseReason = typeof BILLING_LOCK_REASON;

/** Ce que la pause demande au connecteur : ordonner la pause et RELIRE le statut. Jamais plus (surtout pas `resume`). */
export type LockPauseConnector = Pick<PlatformConnector, 'pause' | 'getStatus'>;

export interface LockPauseDeps {
  connector: LockPauseConnector;
  loadToken: RunPublicationDeps['loadToken'];
}

/** Campagnes dont la pause peut être ordonnée au plus par espace et par appel (un compte en a quelques-unes, plafond de sécurité). */
export const PAUSE_PER_WORKSPACE_MAX = 100;

/** Campagnes qu'un passage peut traiter (chaque campagne coûte quelques appels à Meta : ordre, relecture). */
export interface PauseBudget {
  left: number;
}

export interface PauseFailure {
  campaign_id: string;
  name: string;
  /** Code de la liste fermée d'API_SPEC §4 (`meta_token_expired`, `meta_error`, `conflict`…). */
  code: string;
}

export interface PauseReport {
  /** Campagnes mises en pause chez Meta ET dans Pubeka par cet appel. */
  paused: number;
  failed: PauseFailure[];
  /** Vrai si Meta a limité le débit : les campagnes restantes sont reprises à la passe suivante. */
  rate_limited: boolean;
  /** Vrai si le budget du passage est épuisé avant la fin. */
  budget_exhausted: boolean;
  /** Vrai si la limite touchée est celle de l'APPLICATION chez Meta : inutile d'insister sur les autres espaces. */
  app_limited: boolean;
  /** Vrai si `stillApplies` a répondu non (espace renouvelé en cours de passe) : le reste n'est pas touché. */
  guard_stopped: boolean;
}

export interface PauseOptions {
  /** Auteur inscrit dans l'historique : `user` (route) ou `poll` (tâche planifiée). */
  source: 'user' | 'poll';
  /** `billing_lock` : le motif posé ; `null` : pause du client en dehors du verrouillage (aucun motif). */
  reason: PauseReason | null;
  budget: PauseBudget;
  /**
   * Revérifié AVANT CHAQUE campagne (un renouvellement peut survenir pendant la boucle) : faux = on s'arrête, rien de plus n'est mis en
   * pause. La tâche y met « l'espace est-il toujours verrouillé ? ».
   */
  stillApplies?: () => Promise<boolean>;
}

/** Statuts qu'on peut mettre en pause (machine d'état). `publishing` est signalé mais jamais touché : la publication se termine. */
const LIVE_STATUSES = ['in_review', 'active', 'error'] as const;

interface Candidate {
  id: string;
  name: string;
  status: string;
  ad_account_id: string | null;
  meta_campaign_id: string | null;
  lock_pause_failures: number;
  lock_pause_retry_at: string | null;
}

/** Recul des échecs de la tâche : 10 min, 20 min, 40 min… plafonné à 6 h (colonnes `lock_pause_*`, migration 0022). */
export const BACKOFF_BASE_MS = 10 * 60_000;
export const BACKOFF_MAX_MS = 6 * 3600_000;
export function backoffDelayMs(failures: number): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** Math.min(Math.max(failures - 1, 0), 10), BACKOFF_MAX_MS);
}

function failure(candidate: Candidate, error: unknown): PauseFailure {
  const app = error instanceof AppError ? error : toAppError(error);
  return { campaign_id: candidate.id, name: candidate.name, code: app.code };
}

/** Ordre de pause PUIS relecture : « en pause » seulement si Meta le confirme (règle 1). */
async function pauseAndConfirm(
  deps: LockPauseDeps,
  token: PlatformToken,
  refs: PlatformCampaignRefs,
): Promise<void> {
  let pauseError: unknown;
  let pauseFailed = false;
  try {
    await deps.connector.pause(token, refs);
  } catch (error) {
    if (metaRateLimitScope(error) !== null) throw error;
    pauseFailed = true;
    pauseError = error;
  }
  let status: PlatformStatus;
  try {
    status = await deps.connector.getStatus(token, refs);
  } catch (error) {
    if (metaRateLimitScope(error) !== null) throw error;
    throw toAppError(pauseFailed ? pauseError : error);
  }
  if (status.status === 'paused') return;
  throw pauseFailed
    ? toAppError(pauseError)
    : new AppError('meta_error', {
        meta: { reason: 'pause_not_confirmed', raw_status: status.rawStatus },
      });
}

async function pauseOne(
  ctx: ServiceCtx,
  deps: LockPauseDeps,
  tokens: Map<string, Promise<PlatformToken>>,
  workspaceId: string,
  candidate: Candidate,
  options: PauseOptions,
): Promise<'paused' | 'skipped' | 'budget'> {
  const row = await loadPublishRow(ctx.svc, workspaceId, candidate.id);
  if (row.status === 'paused') return 'skipped';
  if (!nextCampaignStatus(row.status, 'pause').ok) {
    throw new AppError('conflict', { meta: { reason: 'invalid_transition', status: row.status } });
  }
  const inputs = await loadPublishInputs(ctx.svc, workspaceId, row, ctx.now());
  if (inputs.adAccount === null || inputs.connection === null) {
    throw new AppError('meta_not_connected');
  }
  if (inputs.connection.status === 'expired' || inputs.connection.status === 'revoked') {
    throw new AppError('meta_token_expired');
  }
  const refs = await loadRefs(ctx.svc, row, inputs.adAccount.metaAdAccountId);
  if (refs === null) throw new AppError('conflict', { meta: { reason: 'not_published_on_meta' } });

  const connection = inputs.connection;
  let token = tokens.get(connection.id);
  if (token === undefined) {
    token = deps.loadToken(ctx.svc, workspaceId, connection);
    tokens.set(connection.id, token);
  }
  const accessToken = await token;
  // Le budget ne compte que ce qui part réellement chez Meta : une campagne en échec LOCAL (jeton expiré, connexion absente) ne prive pas les autres.
  if (options.budget.left <= 0) return 'budget';
  options.budget.left -= 1;
  await pauseAndConfirm(deps, accessToken, refs);

  const patch = {
    paused_at: ctx.now().toISOString(),
    // Pause réussie : plus de recul à garder.
    lock_pause_failures: 0,
    lock_pause_retry_at: null,
    ...(options.reason === null ? {} : { pause_reason: options.reason }),
  };
  const written = await applyTransition(ctx.svc, row, 'pause', patch);
  if (written === null) {
    // Quelqu'un a agi entre la lecture et l'écriture : si la campagne est maintenant en pause, le but est atteint.
    const latest = await loadPublishRow(ctx.svc, workspaceId, candidate.id);
    if (latest.status !== 'paused') return 'skipped';
    // Course avec `campaign.sync-status` : la synchronisation a lu « paused » chez Meta et écrit `paused` SANS motif avant nous. Meta a
    // confirmé NOTRE pause : on pose le motif (une seule instruction gardée : statut paused ET motif encore vide), sinon « Reprendre mes
    // pubs » ne retrouverait jamais la campagne.
    if (options.reason !== null && (latest.pause_reason ?? null) === null) {
      const marked = await ctx.svc
        .from('campaigns')
        .update({ pause_reason: options.reason })
        .eq('workspace_id', workspaceId)
        .eq('id', candidate.id)
        .eq('status', 'paused')
        .is('pause_reason', null)
        .select('id');
      if (marked.error !== null) throw new AppError('internal_error', { cause: marked.error });
      if (marked.data.length > 0) {
        await recordStatusEvent(ctx.svc, latest, 'paused', options.source, {
          event: 'pause',
          reason: options.reason,
          from: row.status,
          marked_after_sync: true,
        });
      }
    }
    return 'paused';
  }
  await recordStatusEvent(ctx.svc, written, 'paused', options.source, {
    event: 'pause',
    reason: options.reason ?? 'pause_all',
    from: row.status,
  });
  return 'paused';
}

async function listCandidates(
  ctx: ServiceCtx,
  workspaceId: string,
  respectBackoff: boolean,
): Promise<Candidate[]> {
  const rows = unwrap<Candidate[]>(
    await ctx.svc
      .from('campaigns')
      .select(
        'id, name, status, ad_account_id, meta_campaign_id, lock_pause_failures, lock_pause_retry_at',
      )
      .eq('workspace_id', workspaceId)
      .in('status', [...LIVE_STATUSES, 'publishing'])
      .order('created_at', { ascending: true })
      .limit(PAUSE_PER_WORKSPACE_MAX),
  );
  // Une campagne en erreur sans identifiant chez Meta n'existe pas chez Meta : rien à mettre en pause.
  const now = ctx.now().getTime();
  return rows.filter(
    (row) =>
      (row.status !== 'error' || row.meta_campaign_id !== null) &&
      // La tâche respecte le recul (échec permanent) ; un clic du client l'ignore : la pause est sans danger à rejouer.
      !(
        respectBackoff &&
        row.lock_pause_retry_at !== null &&
        Date.parse(row.lock_pause_retry_at) > now
      ),
  );
}

/** Note un échec de la tâche : compteur et prochaine tentative autorisée. Jamais bloquant pour la suite de la passe. */
async function recordBackoff(
  ctx: ServiceCtx,
  workspaceId: string,
  candidate: Candidate,
): Promise<void> {
  const failures = candidate.lock_pause_failures + 1;
  const written = await ctx.svc
    .from('campaigns')
    .update({
      lock_pause_failures: failures,
      lock_pause_retry_at: new Date(ctx.now().getTime() + backoffDelayMs(failures)).toISOString(),
    })
    .eq('workspace_id', workspaceId)
    .eq('id', candidate.id);
  if (written.error !== null) {
    logger.error('Recul non écrit', { campaignId: candidate.id, code: written.error.code });
  }
}

export function emptyPauseReport(): PauseReport {
  return {
    paused: 0,
    failed: [],
    rate_limited: false,
    budget_exhausted: false,
    app_limited: false,
    guard_stopped: false,
  };
}

/**
 * Met en pause chez Meta, puis dans Pubeka, toutes les campagnes vivantes de L'ESPACE donné (jamais d'un autre : chaque lecture est
 * filtrée par `workspace_id`). Une campagne en cours de publication n'est pas touchée : elle est signalée (`conflict`) et la passe
 * suivante (ou un nouveau clic) la prendra quand elle sera en vérification.
 */
export async function pauseWorkspaceCampaigns(
  ctx: ServiceCtx,
  deps: LockPauseDeps,
  workspaceId: string,
  options: PauseOptions,
  tokens = new Map<string, Promise<PlatformToken>>(),
): Promise<PauseReport> {
  const report = emptyPauseReport();
  const blockedAdAccounts = new Set<string>();
  for (const candidate of await listCandidates(ctx, workspaceId, options.source === 'poll')) {
    if (candidate.status === 'publishing') {
      report.failed.push({ campaign_id: candidate.id, name: candidate.name, code: 'conflict' });
      continue;
    }
    if (candidate.ad_account_id !== null && blockedAdAccounts.has(candidate.ad_account_id)) {
      report.failed.push({
        campaign_id: candidate.id,
        name: candidate.name,
        code: 'rate_limited',
      });
      continue;
    }
    if (options.stillApplies !== undefined && !(await options.stillApplies())) {
      report.guard_stopped = true;
      break;
    }
    try {
      const outcome = await pauseOne(ctx, deps, tokens, workspaceId, candidate, options);
      if (outcome === 'budget') {
        report.budget_exhausted = true;
        break;
      }
      if (outcome === 'paused') report.paused += 1;
    } catch (error) {
      const scope = metaRateLimitScope(error);
      if (scope !== null) {
        // EC-META-10 : on n'insiste pas. La campagne n'est pas marquée, la passe suivante reprendra.
        report.rate_limited = true;
        report.failed.push({
          campaign_id: candidate.id,
          name: candidate.name,
          code: 'rate_limited',
        });
        if (scope === 'app') {
          report.app_limited = true;
          break;
        }
        if (candidate.ad_account_id !== null) blockedAdAccounts.add(candidate.ad_account_id);
        continue;
      }
      const entry = failure(candidate, error);
      report.failed.push(entry);
      logger.error('Pause impossible', { campaignId: candidate.id, code: entry.code, err: error });
      if (options.source === 'poll') await recordBackoff(ctx, workspaceId, candidate);
    }
  }
  return report;
}
