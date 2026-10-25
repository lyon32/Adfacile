// POST /workspaces/{ws}/campaigns/{id}/publish : le client clique sur « Publier » (LLD §6.8, APPFLOW §8.6).
//
// CE CAS D'USAGE NE PARLE JAMAIS À META. Il vérifie tout, retient le quota, passe la campagne en `publishing` en UNE
// instruction, enregistre la référence de rapprochement, puis lance la tâche `campaign.publish` (202). C'est la tâche qui crée
// la campagne chez Meta (run-publication.ts), avec son rapprochement des résultats incertains (SECURITY_NOTES EC-META-05).
//
// Ordre (rien n'est dépensé tant que tout n'est pas valide) :
//   rôle, espace modifiable → campagne de CET espace → rejeu de la même clé → état de la campagne → clause de responsabilité
//   → Page dans la formule → Meta relié, jeton valable, moyen de paiement → champs, dates, budget, visuel → monnaie du compte
//   et taux → total confirmé (EC-CAMP-05) → quota (`beforeSpend`) → `draft|rejected|error → publishing` (verrou optimiste)
//   → clause enregistrée → historique → tâche.
// Tout montant, budget et date est relu depuis la base : rien ne vient du navigateur (SECURITY_NOTES §3.2).
import { AppError, type FieldError } from '@pubeka/contracts';
import { assertMetaPublishEnabled } from './publish-switch';
import { calendarDateIn } from '@pubeka/shared';
import type { MemberCtx } from '../../context';
import { assertRole, assertWritable } from '../../workspaces/guards';
import { checkCampaignFields } from '../campaign-fields';
import { copySchema, geoSchema, readJson, targetingSchema, type AdCopy } from '../campaign-schemas';
import { nextCampaignStatus } from '../campaign-state';
import { toCampaignView, type CampaignView } from '../campaign-view';
import { campaignCost } from '../cost';
import { loadCostContext } from '../cost-context';
import { loadAccountCurrency } from './account-rate';
import { failPublication } from './fail-publication';
import { loadPublishInputs, type PublishInputs } from './load-inputs';
import { loadPublishRow } from './publish-row';
import {
  PUBLISH_TASK,
  publishIdempotencyKey,
  publishRef,
  type PublishCampaignDeps,
  type PublishRow,
} from './publish-types';
import { addDays } from './dates';
import { assertPageInPlan } from './page-guard';
import { applyTransition, recordStatusEvent } from './transitions';

export interface ConfirmedTotal {
  amountMinor: number;
  currency: string;
}

export interface PublishCampaignInput {
  /** `Idempotency-Key` de la requête : une clé = une publication, jamais deux. */
  idempotencyKey: string;
  acceptLiability: boolean;
  /** Total affiché à l'écran (EC-CAMP-05). */
  confirmedTotal?: ConfirmedTotal | undefined;
  /**
   * Textes qui REMPLACENT ceux de la campagne dans la même opération (correction d'un refus, S18) : validés comme les autres
   * champs, puis écrits avec le passage en `publishing`. Si la publication est refusée, rien n'est modifié.
   */
  copy?: AdCopy | undefined;
}

/** Écart de total toléré entre l'écran et le recalcul : au-delà, le client reconfirme (SECURITY_NOTES EC-CAMP-05). */
const FX_TOLERANCE_PERCENT = 2;
const MESSAGING = new Set(['WHATSAPP', 'MESSENGER', 'INSTAGRAM_DIRECT']);
const SUPPORTED_DESTINATIONS = new Set([...MESSAGING, 'WEBSITE', 'NONE']);

function db(error: unknown): AppError {
  return new AppError('internal_error', { cause: error });
}

function conflict(reason: string, extra: Record<string, unknown> = {}): AppError {
  return new AppError('conflict', { meta: { reason, ...extra } });
}

function invalid(errors: FieldError[], meta: Record<string, unknown> = {}): AppError {
  return new AppError('validation_failed', { errors, meta });
}

async function liabilityAccepted(ctx: MemberCtx): Promise<boolean> {
  const found = await ctx.svc
    .from('publish_liability_acceptances')
    .select('workspace_id')
    .eq('workspace_id', ctx.workspace.id)
    .maybeSingle();
  if (found.error !== null) throw db(found.error);
  return found.data !== null;
}

export function assertMetaReady(inputs: PublishInputs): void {
  if (inputs.adAccount === null || inputs.connection === null)
    throw new AppError('meta_not_connected');
  if (inputs.connection.status === 'expired' || inputs.connection.status === 'revoked') {
    throw new AppError('meta_token_expired');
  }
  if (inputs.adAccount.hasPaymentMethod === false) {
    throw new AppError('meta_payment_method_missing', { meta: { reason: 'no_payment_method' } });
  }
}

interface Fields {
  copy: ReturnType<typeof readCopy>;
  geo: ReturnType<typeof readGeo>;
  targeting: ReturnType<typeof readTargeting>;
}
const readCopy = (row: PublishRow) => readJson(copySchema, row.copy, {});
const readGeo = (row: PublishRow) => readJson(geoSchema, row.geo, {});
const readTargeting = (row: PublishRow) => readJson(targetingSchema, row.targeting, {});

/** Les champs sans lesquels aucune pub ne peut partir, tous listés d'un coup (APPFLOW §8.6). */
function missingFields(row: PublishRow, inputs: PublishInputs, fields: Fields): FieldError[] {
  const errors: FieldError[] = [];
  const need = (field: string, message: string): void => {
    errors.push({ field, code: 'required', message });
  };
  if (row.objective === null) need('objective', 'Choisis un objectif.');
  if (row.destination === null) need('destination', 'Choisis où mener les personnes.');
  if (row.daily_budget_usd_cents === null)
    need('daily_budget_usd_cents', 'Indique un budget par jour.');
  if (row.start_date === null) need('start_date', 'Indique une date de début.');
  if (row.end_date === null) need('end_date', 'Indique une date de fin.');
  if ((fields.geo.countries ?? []).length === 0 && (fields.geo.cities ?? []).length === 0) {
    need('geo', 'Indique au moins un pays ou une ville.');
  }
  if ((fields.copy.primary_text ?? '').trim() === '')
    need('copy.primary_text', 'Le texte de la pub est obligatoire.');
  if (!MESSAGING.has(row.destination ?? '') && (fields.copy.headline ?? '').trim() === '') {
    need('copy.headline', 'Le titre de la pub est obligatoire.');
  }
  if (row.destination !== null) {
    if (!SUPPORTED_DESTINATIONS.has(row.destination)) {
      errors.push({
        field: 'destination',
        code: 'unsupported',
        message:
          'Cette destination n’est pas encore disponible à la publication. Choisis WhatsApp, Messenger, Instagram ou un site.',
      });
    } else if (row.destination === 'WHATSAPP' && inputs.page?.whatsappLinked !== true) {
      errors.push({
        field: 'destination',
        code: 'whatsapp_not_linked',
        message: 'WhatsApp n’est pas relié à cette Page.',
      });
    } else if (
      row.destination === 'INSTAGRAM_DIRECT' &&
      (inputs.page?.instagramAccountId ?? null) === null
    ) {
      errors.push({
        field: 'destination',
        code: 'instagram_not_linked',
        message: 'Aucun compte Instagram n’est relié à cette Page.',
      });
    } else if (row.destination === 'WEBSITE' && inputs.business.website === null) {
      errors.push({
        field: 'website_url',
        code: 'required',
        message: 'Ajoute l’adresse de ton site : la pub y mène.',
      });
    }
  }
  return errors;
}

/**
 * EC-CAMP-04 : début passé → ramené à « aujourd'hui » (dans le fuseau de l'utilisateur). Si la fin n'est plus après le début,
 * refus AVEC la correction proposée (début ajusté, fin au lendemain).
 */
function adjustedStart(row: PublishRow, today: string): string {
  const start = row.start_date;
  const end = row.end_date;
  if (start === null || end === null) return start ?? today;
  const adjusted = start < today ? today : start;
  if (end <= adjusted) {
    throw invalid(
      [
        {
          field: 'end_date',
          code: 'invalid_value',
          message: `La date de fin doit suivre la date de début (${adjusted}). Propose plutôt le ${addDays(adjusted, 1)}.`,
        },
      ],
      { suggested_start_date: adjusted, suggested_end_date: addDays(adjusted, 1) },
    );
  }
  return adjusted;
}

/** EC-CAMP-06 : la photo doit exister et ne pas être expirée. */
async function assertVisualUsable(ctx: MemberCtx, inputs: PublishInputs): Promise<void> {
  const visual = inputs.visual;
  if (visual === null) {
    throw invalid(
      [{ field: 'visual', code: 'required', message: 'Ajoute une photo : la pub en a besoin.' }],
      {
        reason: 'visual_required',
      },
    );
  }
  const expired = visual.expiresAt !== null && visual.expiresAt.getTime() <= ctx.now().getTime();
  let stored = false;
  if (!expired) {
    const info = await ctx.svc.storage.from(visual.bucket).info(visual.filePath);
    stored = info.error === null;
  }
  if (expired || !stored) {
    throw new AppError('gone', { meta: { reason: 'visual_expired', source_id: visual.sourceId } });
  }
}

/** EC-CAMP-05 : le total affiché doit rester à 2 % près du total recalculé avec le taux du jour. */
async function assertTotalStillValid(
  ctx: MemberCtx,
  row: PublishRow,
  start: string,
  confirmed: ConfirmedTotal | undefined,
): Promise<void> {
  if (confirmed === undefined) return;
  const costContext = await loadCostContext(ctx);
  const cost = campaignCost({
    dailyBudgetUsdCents: row.daily_budget_usd_cents,
    startDate: start,
    endDate: row.end_date,
    fx: costContext.fx,
  });
  const total = cost.total;
  if (total?.currency !== confirmed.currency) {
    throw conflict('fx_changed', {
      new_total:
        total === null
          ? null
          : {
              amount_minor: total.local_minor,
              currency: total.currency,
              usd_cents: total.usd_cents,
            },
    });
  }
  const gap = Math.abs(total.local_minor - confirmed.amountMinor);
  // Comparaison en entiers : gap / nouveau total > 2 %  ⇔  gap × 100 > 2 × nouveau total.
  if (gap * 100 > FX_TOLERANCE_PERCENT * total.local_minor) {
    throw conflict('fx_changed', {
      new_total: {
        amount_minor: total.local_minor,
        currency: total.currency,
        usd_cents: total.usd_cents,
      },
    });
  }
}

/** Le quota doit être retenu pour cette publication, sauf si une publication précédente l'a déjà décompté (republication). */
function needsQuotaHold(row: PublishRow): boolean {
  return row.quota_state === 'none' || row.quota_state === 'released';
}

export async function publishCampaign(
  ctx: MemberCtx,
  campaignId: string,
  input: PublishCampaignInput,
  deps: PublishCampaignDeps,
): Promise<CampaignView> {
  assertRole(ctx, ['owner', 'editor']);
  assertWritable(ctx);
  // Interrupteur de sécurité : Meta réel et publication non activée = refus AVANT toute lecture, écriture ou décompte de quota.
  assertMetaPublishEnabled(deps);
  const workspaceId = ctx.workspace.id;
  const loaded = await loadPublishRow(ctx.db, workspaceId, campaignId);
  const row: PublishRow = input.copy === undefined ? loaded : { ...loaded, copy: input.copy };

  // Rejeu de la même clé : on rend l'état actuel, sans rien refaire (EC-CAMP-01). Jamais une deuxième publication.
  if (row.publish_idempotency_key === input.idempotencyKey && row.status !== 'draft') {
    return toCampaignView(row, await loadCostContext(ctx));
  }

  const decision = nextCampaignStatus(row.status, 'publish');
  if (!decision.ok) {
    if (row.status === 'publishing') throw conflict('publication_in_progress');
    if (row.status === 'in_review' || row.status === 'active' || row.status === 'paused') {
      throw new AppError('already_published');
    }
    throw conflict('invalid_transition', { status: row.status });
  }

  if (!(await liabilityAccepted(ctx)) && !input.acceptLiability) {
    throw new AppError('validation_failed', {
      errors: [
        {
          field: 'accept_liability',
          code: 'required',
          message: 'Accepte la clause de responsabilité avant de publier.',
        },
      ],
      meta: { reason: 'liability_required' },
    });
  }

  const inputs = await loadPublishInputs(ctx.db, workspaceId, row, ctx.now());
  await assertPageInPlan({ svc: ctx.svc, workspaceId }, inputs.page, row.page_id);
  assertMetaReady(inputs);

  const fields: Fields = { copy: readCopy(row), geo: readGeo(row), targeting: readTargeting(row) };
  const missing = missingFields(row, inputs, fields);
  if (missing.length > 0) throw invalid(missing);

  const today = calendarDateIn(ctx.now(), ctx.user.timezone);
  const start = adjustedStart(row, today);
  checkCampaignFields(
    {
      objective: row.objective,
      destination: row.destination,
      dailyBudgetUsdCents: row.daily_budget_usd_cents,
      startDate: start,
      endDate: row.end_date,
      copy: fields.copy,
      targeting: fields.targeting,
      geo: fields.geo,
    },
    new Set([
      'objective',
      'destination',
      'daily_budget_usd_cents',
      'start_date',
      'end_date',
      'copy',
      'targeting',
      'geo',
    ]),
    today,
  );
  await assertVisualUsable(ctx, inputs);
  await loadAccountCurrency(ctx.db, inputs.adAccount?.currency ?? null, ctx.now());
  await assertTotalStillValid(ctx, row, start, input.confirmedTotal);

  // Quota retenu APRÈS toute la validation, AVANT le passage en `publishing` : un refus (402) ne modifie rien.
  const holding = needsQuotaHold(row);
  if (holding && deps.beforeSpend !== undefined) await deps.beforeSpend(campaignId, workspaceId);

  const attempt = row.publish_attempt + 1;
  const started = await applyTransition(
    ctx.svc,
    row,
    'publish',
    {
      start_date: start,
      editable: false,
      publish_attempt: attempt,
      publish_ref: publishRef(campaignId, attempt),
      publish_idempotency_key: input.idempotencyKey,
      publish_phase: 'none',
      publish_started_at: ctx.now().toISOString(),
      publish_error: null,
      quota_state: holding ? 'held' : row.quota_state,
      ...(input.copy === undefined ? {} : { copy: input.copy }),
    },
    { version: row.version },
  );
  if (started === null) {
    // Un autre clic ou une modification a gagné : ce qu'on avait retenu est rendu.
    if (holding && deps.release !== undefined) await deps.release(campaignId, workspaceId);
    const latest = await loadPublishRow(ctx.db, workspaceId, campaignId);
    throw conflict(latest.status === 'publishing' ? 'publication_in_progress' : 'stale_version', {
      current_version: latest.version,
    });
  }

  // Clause : enregistrée au premier clic valide (date et utilisateur). La première acceptation est conservée.
  if (input.acceptLiability) {
    const recorded = await ctx.svc.from('publish_liability_acceptances').insert({
      workspace_id: workspaceId,
      accepted_by: ctx.user.id,
      accepted_at: ctx.now().toISOString(),
    });
    // 23505 : déjà acceptée (course entre deux clics) : sans conséquence.
    if (recorded.error !== null && recorded.error.code !== '23505') throw db(recorded.error);
  }
  await recordStatusEvent(ctx.svc, started, 'publishing', 'user', { attempt });

  try {
    await deps.jobs.enqueue(
      PUBLISH_TASK,
      { campaignId, workspaceId },
      publishIdempotencyKey(campaignId, attempt),
    );
  } catch (cause) {
    // La campagne ne peut pas partir : elle ne reste pas bloquée en « Publication en cours » (quota rendu).
    const error = new AppError('provider_unavailable', { cause });
    await failPublication(ctx.svc, deps, ctx.now(), started, error);
    throw error;
  }

  return toCampaignView(started, await loadCostContext(ctx));
}
