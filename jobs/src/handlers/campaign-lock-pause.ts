import {
  createCampaignControlDeps,
  pauseLockedWorkspaces,
  type LockPauseReport,
} from '@pubeka/core';
import { createServiceClient } from '@pubeka/db';
import { createRequestId, getEnv } from '@pubeka/shared';
import { z } from 'zod';
import type { JobHandlerDefinition } from '../dispatcher';

// Tâche `campaign.lock-pause` (S19b, TR-PAY-07, EC-PAY-11) : toutes les 10 minutes, repère les espaces VERROUILLÉS (grâce de 3 jours
// écoulée, ou essai terminé sans abonnement) qui ont encore des publicités vivantes chez Meta et les met en pause. Décision de la personne
// (26/10/2026) : jamais de reprise automatique, la reprise est le bouton « Reprendre mes pubs ». Une pause qui échoue chez Meta n'est
// JAMAIS marquée localement (relecture du statut) ; la passe suivante réessaie (la pause est sans danger à rejouer, contrairement à une
// dépense). Budget par passage et arrêt sur limite de débit (EC-META-10) dans `core`. Le motif `billing_lock` est posé sur chaque
// campagne mise en pause, avec une ligne d'historique. L'interrupteur `PUBEKA_META_PUBLISH` ne bloque jamais cette tâche.
export const CAMPAIGN_LOCK_PAUSE_TASK = 'campaign.lock-pause';
export const CAMPAIGN_LOCK_PAUSE_CRON = '*/10 * * * *';

export const campaignLockPausePayloadSchema = z.strictObject({});
export type CampaignLockPausePayload = z.infer<typeof campaignLockPausePayloadSchema>;

export const campaignLockPauseHandler: JobHandlerDefinition<
  CampaignLockPausePayload,
  LockPauseReport
> = {
  id: CAMPAIGN_LOCK_PAUSE_TASK,
  payloadSchema: campaignLockPausePayloadSchema,
  run: async (_payload, ctx) => {
    const env = getEnv();
    const svc = createServiceClient({
      url: env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL,
      secretKey: env.SUPABASE_SECRET_KEY,
    });
    const report = await pauseLockedWorkspaces(
      { requestId: createRequestId(), svc, now: ctx.now },
      createCampaignControlDeps(env, ctx.now),
    );
    failLoudly(report);
    return report;
  },
};

/**
 * ÉCHEC BRUYANT. Tant qu'il n'y a pas d'alerte à la personne (S27), un client verrouillé dont la pause échoue partout (jeton expiré,
 * Meta en panne) continuerait de dépenser sans que personne le sache. Quand AUCUNE pause n'a réussi et qu'au moins une a échoué pour
 * une vraie raison, la tâche ÉCHOUE : le message, sans nom de campagne ni donnée du client, apparaît dans Trigger.dev. Une campagne en
 * cours de publication (`conflict`) n'est pas une panne. Une passe qui a réussi au moins une pause reste verte : le reste est retenté
 * (avec recul, migration 0022).
 */
function failLoudly(report: LockPauseReport): void {
  const hard = report.failed.filter((f) => f.code !== 'conflict');
  if (hard.length === 0 || report.paused > 0) return;
  const codes = new Map<string, number>();
  for (const failure of hard) codes.set(failure.code, (codes.get(failure.code) ?? 0) + 1);
  const detail = [...codes].map(([code, count]) => `${code}×${String(count)}`).join(', ');
  const workspaces = new Set(hard.map((f) => f.workspace_id)).size;
  throw new Error(
    `campaign.lock-pause : ${String(hard.length)} pause(s) en échec, aucune réussie, ${String(workspaces)} espace(s) verrouillé(s) concerné(s) (${detail}). Des publicités peuvent encore diffuser : vérifier la connexion Meta des espaces concernés.`,
  );
}
