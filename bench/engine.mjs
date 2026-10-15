// Moteur du banc : jeux de cas, prompts versionnés, appel d'un modèle avec UN seul nouvel essai, notation.
// Sans réseau par lui-même : l'appel au modèle est une fonction passée en paramètre (providers.mjs en vrai,
// une fausse fonction dans bench.test.mjs).
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreAnalyste, scoreStratege, scoreModerateur, scoreDesigner, parse } from './scoring.mjs';

export const BENCH_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(BENCH_DIR, '..');
export const AGENTS_SRC = join(REPO_ROOT, 'packages', 'agents', 'src');
export const AGENT_NAMES = ['analyste', 'stratege', 'moderateur', 'designer'];

const load = (rel) => JSON.parse(readFileSync(join(BENCH_DIR, rel), 'utf8'));

export const SCORERS = { analyste: scoreAnalyste, stratege: scoreStratege, moderateur: scoreModerateur, designer: scoreDesigner };

export function casesFor(agent) {
  switch (agent) {
    case 'analyste': return [...load('datasets/businesses.json'), ...load('datasets/trap.json')];
    case 'stratege': return load('datasets/strategist.json');
    case 'moderateur': return load('datasets/rejections.json');
    case 'designer': return load('datasets/designer.json');
    default: throw new Error(`Agent inconnu : ${agent}`);
  }
}

/** N cas répartis sur tout le jeu (le premier, le dernier et ce qui est entre) : un jeu d'essai représentatif. */
export function pickCases(cases, limit) {
  if (!limit || limit >= cases.length) return cases;
  if (limit === 1) return [cases[0]];
  const idx = new Set();
  for (let i = 0; i < limit; i++) idx.add(Math.round((i * (cases.length - 1)) / (limit - 1)));
  return [...idx].map(i => cases[i]);
}

/** Prompt de l'agent : la version la plus élevée de packages/agents/src/<agent>/prompts/v<N>.md. */
export function promptFor(agent, srcDir = AGENTS_SRC) {
  const dir = join(srcDir, agent, 'prompts');
  const versions = existsSync(dir)
    ? readdirSync(dir).map(f => f.match(/^v(\d+)\.md$/)).filter(Boolean).map(m => Number(m[1])).sort((a, b) => b - a)
    : [];
  if (!versions.length) throw new Error(`Aucun prompt pour « ${agent} » dans ${dir}`);
  return { text: readFileSync(join(dir, `v${versions[0]}.md`), 'utf8'), version: `${agent}@${versions[0]}` };
}

/** Réglages communs avec l'application (température fixée par la configuration, docs/agents R10). */
export function agentConfig(agent, srcDir = AGENTS_SRC) {
  const cfg = JSON.parse(readFileSync(join(srcDir, 'runtime', 'models.json'), 'utf8')).agents[agent];
  return { temperature: cfg?.temperature ?? 0.2 };
}

export function userMessage(agent, c) {
  return JSON.stringify(agent === 'analyste'
    ? { business_id: c.id, locale: { country: c.country, output_language: c.lang }, sources: c.sources }
    : agent === 'stratege'
      ? { today: c.today, output_language: c.lang, ad_address: c.ad_address ?? 'vous', profile: c.profile, account_state: c.account_state, user_constraints: c.user_constraints ?? {}, previous_proposals: c.previous_proposals ?? [] }
      : agent === 'designer'
        ? { mode: 'generate', count: c.count, format: c.format, country: c.country, profile: c.profile, brand_kit: c.brand_kit, copy: c.copy, product_images: c.product_images, answers: c.answers, library_references: [] }
        : { output_language: c.lang, ad: c.ad, meta_rejection: c.meta_rejection });
}

const costOf = (r, m) => r.cost ?? (r.inTokens * m.price[0] + r.outTokens * m.price[1]) / 1e6;

/**
 * Un cas, un modèle. Au plus DEUX appels : l'appel initial et un seul nouvel essai (docs/agents R2, TR-AGT-01),
 * qu'il vienne d'un JSON invalide ou, pour le Stratège, de textes trop longs. Jamais un troisième.
 * @param {{ call: Function, model: object, agent: string, c: object, system: string, temperature?: number }} p
 */
export async function runCase({ call, model: m, agent, c, system, temperature = 0.2 }) {
  const user = userMessage(agent, c);
  const t0 = Date.now();
  let calls = 0, cost = 0, answeredBy;
  const ask = async (text) => {
    calls += 1;
    const r = await call(m, system, text, { temperature });
    cost += costOf(r, m);
    answeredBy = r.model ?? answeredBy;
    return r;
  };
  try {
    let r = await ask(user);
    let out = parse(r.text), retried = false;
    if (!out) {
      retried = true;
      r = await ask(`${user}\n\nTa réponse précédente n'était pas un JSON valide. Réponds uniquement par le JSON.`);
      out = parse(r.text);
    }
    if (agent === 'stratege' && out?.copy) {
      const tooLong = [];
      if ((out.copy.primary_text ?? '').length > 125) tooLong.push(`primary_text fait ${out.copy.primary_text.length} caractères (max 125)`);
      if ((out.copy.headline ?? '').length > 40) tooLong.push(`headline fait ${out.copy.headline.length} caractères (max 40)`);
      if (tooLong.length && !retried) {
        retried = true;
        r = await ask(`${user}\n\nCorrige ta réponse précédente : ${tooLong.join(' ; ')}. Raccourcis sans changer le reste.\n${JSON.stringify(out)}`);
        out = parse(r.text) ?? out;
      }
    }
    const checks = SCORERS[agent](c, out);
    return { id: c.id, ms: Date.now() - t0, cost, calls, retried, answeredBy, checks, out };
  } catch (err) {
    if (err?.code === 'BUDGET_REACHED') throw err;
    return { id: c.id, ms: Date.now() - t0, cost, calls, error: String(err.message).slice(0, 200), checks: { schema: false } };
  }
}

/** Rejoue une sortie enregistrée : mêmes contrôles, aucun réseau. Une erreur du fournisseur n'est pas rejouée. */
export function replayCase({ agent, c, record }) {
  if (!record || record.error || record.out === undefined) return null;
  return { id: c.id, ms: record.ms ?? 0, cost: record.cost ?? 0, calls: 0, retried: !!record.retried, checks: SCORERS[agent](c, record.out), out: record.out };
}

export const failedChecks = (r) => Object.entries(r.checks).filter(([k, v]) => !v && !k.startsWith('_')).map(([k]) => k);

/** Ligne de synthèse d'un modèle sur un agent. */
export function summarize(agent, m, results, promptVersion) {
  const all = results.flatMap(r => Object.entries(r.checks).filter(([k]) => !k.startsWith('_')).map(([, v]) => v));
  const ms = results.map(r => r.ms).sort((a, b) => a - b);
  return {
    agent, model: m.id, prompt: promptVersion,
    cases: results.length,
    score: all.length ? Math.round(100 * all.filter(Boolean).length / all.length) : 0,
    schema: `${results.filter(r => r.checks.schema).length}/${results.length}`,
    errors: results.filter(r => r.error).length,
    requests: results.reduce((s, r) => s + (r.calls ?? 0), 0),
    cost_per_call: results.length ? results.reduce((s, r) => s + r.cost, 0) / results.length : 0,
    p50_ms: ms[Math.floor(ms.length / 2)] ?? 0, p95_ms: ms[Math.floor(ms.length * 0.95)] ?? 0,
    failures: results.flatMap(r => failedChecks(r).map(k => `${r.id}:${k}`)),
  };
}

/**
 * Coût d'une campagne = un appel de l'Analyste + un appel du Stratège (moyennes mesurées, nouvel essai compris).
 * Le Modérateur n'intervient qu'après un refus de la plateforme : il est rendu à part, jamais dans le total.
 * `evaluations[i]` correspond à `summary[i]`. Rend, par modèle, le coût s'il fait les deux agents, et la combinaison
 * la moins chère parmi les modèles conformes aux seuils (un modèle par agent).
 */
export function campaignCosts(summary, evaluations, targetUsd) {
  const rows = summary.map((s, i) => ({ ...s, passed: evaluations[i]?.passed === true }));
  const of = (agent) => rows.filter(r => r.agent === agent);
  const single = [];
  for (const a of of('analyste')) {
    const st = of('stratege').find(r => r.model === a.model);
    if (st) single.push({ model: a.model, usd: a.cost_per_call + st.cost_per_call, passed: a.passed && st.passed });
  }
  const pass = (agent) => of(agent).filter(r => r.passed).sort((x, y) => x.cost_per_call - y.cost_per_call)[0];
  const a = pass('analyste'), st = pass('stratege');
  const combo = a && st ? { analyste: a.model, stratege: st.model, usd: a.cost_per_call + st.cost_per_call } : null;
  const moderator = pass('moderateur') ?? null;
  const over = (usd) => targetUsd !== undefined && usd > targetUsd;
  return {
    single: single.map(x => ({ ...x, overTarget: over(x.usd) })),
    combo: combo && { ...combo, overTarget: over(combo.usd) },
    moderator: moderator && { model: moderator.model, usd: moderator.cost_per_call },
    targetUsd,
  };
}

/** Texte du rapport sur le coût par campagne. `recorded` : sorties rejouées, coûts non significatifs. */
export function campaignCostReport(costs, recorded) {
  if (recorded) return '\nCoût par campagne : non calculé en rejeu (les sorties enregistrées ne portent pas de coût réel).\n';
  const usd = (n) => `${n.toFixed(5)} $`;
  const over = ' — AU-DESSUS de l\'objectif';
  const target = costs.targetUsd === undefined ? '' : `, objectif ${usd(costs.targetUsd)}`;
  const lines = ['', `## Coût par campagne (Analyste + Stratège, moyennes mesurées${target})`, ''];
  if (!costs.single.length && !costs.combo) lines.push('Non calculable : il faut l\'Analyste et le Stratège sur le même lancement.');
  for (const x of costs.single) lines.push(`- ${x.model} (fait les deux) : **${usd(x.usd)}**${x.overTarget ? over : ''}${x.passed ? '' : ' — sous les seuils de qualité'}`);
  if (costs.combo) lines.push(`- Combinaison conforme la moins chère : Analyste ${costs.combo.analyste} + Stratège ${costs.combo.stratege} = **${usd(costs.combo.usd)}**${costs.combo.overTarget ? over : ''}`);
  if (costs.moderator) lines.push(`- Modérateur (à part, seulement après un refus) : ${costs.moderator.model} ${usd(costs.moderator.usd)} par refus`);
  return lines.join('\n') + '\n';
}
