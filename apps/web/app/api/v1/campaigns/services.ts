import 'server-only';
// Services des routes « propositions » : passerelle IA (réelle ou fausse selon PUBEKA_FAKE_PROVIDERS) et réglage des modèles.
// Les points d'accroche des quotas et des crédits (`beforeSpend`, `afterAccepted`) arrivent avec S24.
import {
  createProposalDeps,
  createCampaignControlDeps,
  metaPublishAllowed,
  type CampaignControlDeps,
  type JobEnqueuer,
  type ProposalDeps,
  type PublishCampaignDeps,
} from '@pubeka/core';
import { getEnv } from '@pubeka/shared';
import type { ListCursorCodec } from '@pubeka/core';
import { createCursorCodec } from '../../../../server/http/cursor-codec';
import { createJobDispatcher, type JobDispatcher } from '@pubeka/jobs';

let deps: ProposalDeps | undefined;

export function proposalDeps(): ProposalDeps {
  deps ??= createProposalDeps(getEnv());
  return deps;
}

let dispatcher: JobDispatcher | undefined;

function createJobEnqueuer(): JobEnqueuer {
  return {
    async enqueue(taskId, payload, idempotencyKey) {
      dispatcher ??= createJobDispatcher(getEnv());
      await dispatcher.dispatch(taskId, payload, { idempotencyKey });
    },
  };
}

/** Codec des curseurs de liste : signé avec `APP_SIGNING_SECRET` (le même secret que le `state` de connexion Meta, ENV_SETUP). */
export function cursorCodec(): ListCursorCodec {
  return createCursorCodec(getEnv().APP_SIGNING_SECRET);
}

/** Lanceur de tâches des routes de lecture (« Actualiser », signal d'un webhook) : celui de `publishDeps`, remplaçable par les tests. */
export function syncJobs(): JobEnqueuer {
  return syncJobsOverride ?? publishDeps().jobs;
}

let syncJobsOverride: JobEnqueuer | undefined;

/**
 * Tests d'intégration seulement : remplace UNIQUEMENT le lanceur de « Actualiser » et du webhook. La publication, elle, garde ses
 * dépendances normales (la tâche tourne en mode `inline` avec la fausse Meta) : un test qui a besoin d'une campagne déjà envoyée à
 * Meta ne doit pas remplacer le lanceur de la publication. Refusé en production.
 */
export function overrideSyncJobs(jobs: JobEnqueuer | undefined): void {
  if (getEnv().NEXT_PUBLIC_APP_ENV === 'production') {
    throw new Error('overrideSyncJobs est réservé aux tests');
  }
  syncJobsOverride = jobs;
}

let publishOverride: PublishCampaignDeps | undefined;
let publishDefault: PublishCampaignDeps | undefined;

/**
 * Dépendances de la route `publish` : lancement de la tâche (Trigger.dev, ou `inline` en développement) et points d'accroche
 * du quota (S24 les remplira : `beforeSpend`, `afterAccepted`, `release`).
 */
export function publishDeps(): PublishCampaignDeps {
  if (publishOverride !== undefined) return publishOverride;
  // Interrupteur de publication réelle (PUBEKA_META_PUBLISH) : exigé seulement quand Meta est RÉEL.
  publishDefault ??= {
    jobs: createJobEnqueuer(),
    metaPublishEnabled: () => metaPublishAllowed(getEnv()),
  };
  return publishDefault;
}

/** Tests d'intégration seulement : remplace les dépendances (fausse file de tâches, quota simulé). Refusé en production. */
export function overridePublishDeps(deps: PublishCampaignDeps | undefined): void {
  if (getEnv().NEXT_PUBLIC_APP_ENV === 'production') {
    throw new Error('overridePublishDeps est réservé aux tests');
  }
  publishOverride = deps;
}

let controlOverride: CampaignControlDeps | undefined;
let controlDefault: CampaignControlDeps | undefined;

/** Dépendances de la pause, de la reprise et de la relance : le connecteur Meta (réel, ou faux selon PUBEKA_FAKE_PROVIDERS) et le jeton. */
export function controlDeps(): CampaignControlDeps {
  if (controlOverride !== undefined) return controlOverride;
  controlDefault ??= createCampaignControlDeps(getEnv(), () => new Date());
  return controlDefault;
}

/** Tests d'intégration seulement. Refusé en production. */
export function overrideControlDeps(deps: CampaignControlDeps | undefined): void {
  if (getEnv().NEXT_PUBLIC_APP_ENV === 'production') {
    throw new Error('overrideControlDeps est réservé aux tests');
  }
  controlOverride = deps;
}
