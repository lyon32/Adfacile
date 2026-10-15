// Réglage du modèle de chaque agent : une configuration (`models.json`) que la variable
// `AGENT_MODELS` peut surcharger. Le modèle n'est jamais une constante du code ni du prompt, et la
// passerelle accepte n'importe quel identifiant OpenRouter (ex. `google/gemma-4-31b-it:free`).
import { z } from 'zod';
import defaults from './models.json';
import { AGENT_NAMES, type AgentName } from './types';

export interface AgentModelSetting {
  model: string;
  fallbackModel?: string;
  temperature: number;
}

export type AgentModelSettings = Record<AgentName, AgentModelSetting>;

/** Identifiant de modèle OpenRouter : `auteur/modele` avec variante facultative (`:free`). */
const modelId = z
  .string()
  .min(3)
  .max(120)
  .regex(/^[A-Za-z0-9~][\w.~-]*\/[\w.:~-]+$/, 'identifiant de la forme auteur/modele');

const agentDefault = z.strictObject({
  model: modelId,
  fallback: modelId.optional(),
  temperature: z.number().min(0).max(2),
});

const defaultsSchema = z.object({
  agents: z.strictObject({
    analyste: agentDefault,
    stratege: agentDefault,
    designer: agentDefault,
    moderateur: agentDefault,
    optimiseur: agentDefault,
    aide: agentDefault,
  }),
});

/** Un texte (le modèle seul) ou un objet `{ model, fallback }`. */
const overrideEntry = z.union([
  modelId.transform((model) => ({ model, fallback: undefined })),
  z.strictObject({ model: modelId, fallback: modelId.optional() }),
]);

const overrideSchema = z.strictObject({
  analyste: overrideEntry.optional(),
  stratege: overrideEntry.optional(),
  designer: overrideEntry.optional(),
  moderateur: overrideEntry.optional(),
  optimiseur: overrideEntry.optional(),
  aide: overrideEntry.optional(),
});

export class AgentModelsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentModelsError';
  }
}

function setting(
  model: string,
  fallback: string | undefined,
  temperature: number,
): AgentModelSetting {
  return fallback === undefined
    ? { model, temperature }
    : { model, fallbackModel: fallback, temperature };
}

/**
 * Modèles de tous les agents. `override` est la valeur brute de la variable `AGENT_MODELS`, par exemple
 * `{"analyste":"google/gemma-4-31b-it:free","stratege":{"model":"a/b","fallback":"c/d"}}`.
 * Un simple texte remplace le modèle et retire le modèle de secours du réglage par défaut ;
 * la température reste celle de la configuration (docs/agents R10).
 */
export function resolveAgentModels(override?: string): AgentModelSettings {
  const base = defaultsSchema.parse(defaults).agents;
  const merged: AgentModelSettings = {
    analyste: setting(base.analyste.model, base.analyste.fallback, base.analyste.temperature),
    stratege: setting(base.stratege.model, base.stratege.fallback, base.stratege.temperature),
    designer: setting(base.designer.model, base.designer.fallback, base.designer.temperature),
    moderateur: setting(
      base.moderateur.model,
      base.moderateur.fallback,
      base.moderateur.temperature,
    ),
    optimiseur: setting(
      base.optimiseur.model,
      base.optimiseur.fallback,
      base.optimiseur.temperature,
    ),
    aide: setting(base.aide.model, base.aide.fallback, base.aide.temperature),
  };
  if (override === undefined || override.trim() === '') return merged;

  let raw: unknown;
  try {
    raw = JSON.parse(override);
  } catch {
    throw new AgentModelsError('AGENT_MODELS : JSON invalide');
  }
  const parsed = overrideSchema.safeParse(raw);
  if (!parsed.success) {
    const where = parsed.error.issues.map((i) => i.path.join('.') || '(racine)').join(', ');
    throw new AgentModelsError(`AGENT_MODELS : réglage invalide (${where})`);
  }
  for (const name of AGENT_NAMES) {
    const entry = parsed.data[name];
    if (entry === undefined) continue;
    merged[name] = setting(entry.model, entry.fallback, merged[name].temperature);
  }
  return merged;
}

export function resolveAgentModel(name: AgentName, override?: string): AgentModelSetting {
  return resolveAgentModels(override)[name];
}
