// Journal `agent_runs` (R11, TR-AGT-02) : un appel d'agent, même raté (il a pu coûter des jetons), laisse une ligne.
// Écrit par `core`, jamais par `agents` (LLD §6.10). On n'y met jamais le contenu des sources ni les images.
import type { AgentRunRecord } from '@pubeka/agents';
import type { Json } from '@pubeka/db';
import { createLogger } from '@pubeka/shared';
import type { ServiceCtx } from './context';

const logger = createLogger({ base: { module: 'agent-journal' } });

/** Écrit la ligne et rend son identifiant ; `null` si l'écriture échoue (le journal ne fait jamais échouer le travail). */
export async function journalAgentRun(
  svc: ServiceCtx['svc'],
  run: AgentRunRecord,
  summary: NonNullable<Json>,
  workspaceId: string,
): Promise<string | null> {
  const inserted = await svc
    .from('agent_runs')
    .insert({
      workspace_id: workspaceId,
      agent: run.agent,
      model: run.model,
      requested_model: run.requestedModel,
      provider: run.provider,
      attempts: run.attempts,
      error_code: run.errorCode,
      prompt_version: run.promptVersion,
      input: summary,
      ...(run.output === null ? {} : { output: run.output as NonNullable<Json> }),
      valid_schema: run.validSchema,
      retried: run.retried,
      tokens_in: run.tokensIn,
      tokens_out: run.tokensOut,
      cost_usd: run.costUsd,
      latency_ms: run.latencyMs,
    })
    .select('id')
    .single();
  if (inserted.error !== null) {
    logger.error('Journal des agents non écrit', { code: inserted.error.code });
    return null;
  }
  return inserted.data.id;
}
