// Banc de test Pubeka (docs/agents/benchmark.md, TR-AGT-04, TR-AGT-05).
//
//   node bench/run.mjs [--only=id,id] [--agent=analyste,stratege,moderateur,designer] [--limit=N] [--delay=ms]
//
//   --limit=N          N cas par agent (répartis sur tout le jeu) : essai court, utile avec une offre gratuite
//   --delay=ms         pause entre deux requêtes (quotas)
//   --model=a/b,c/d    modèles OpenRouter à essayer tels quels (n'importe quel identifiant de la passerelle)
//   --list-openrouter  liste les modèles d'OpenRouter (API publique, sans clé) ; ajouter --free pour les gratuits
//   --max-requests=N   s'arrête avant d'envoyer plus de N requêtes réelles au total
//   --replay[=fichier] rejoue des sorties ENREGISTRÉES (bench/baseline.json par défaut ; un autre fichier de référence en option) : aucun réseau, aucune clé
//   --no-enforce       n'échoue pas sous les seuils (exploration)
//
// Sort avec le code 1 si un modèle passe sous les seuils de TR-AGT-05 (bench/scoring.mjs), si aucune clé n'est trouvée
// ou si rien n'a pu être noté. Les clés viennent de bench/.env (ignoré par git) ou de BENCH_ENV_FILE ; elles ne sont jamais affichées.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { providers, listOpenRouterModels, openRouterFreeQuota } from './providers.mjs';
import { evaluateThresholds } from './scoring.mjs';
import { AGENT_NAMES, BENCH_DIR, agentConfig, campaignCostReport, campaignCosts, casesFor, failedChecks, pickCases, promptFor, replayCase, runCase, summarize } from './engine.mjs';

const envFile = process.env.BENCH_ENV_FILE ?? join(BENCH_DIR, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const argv = process.argv.slice(2);
const flag = (k) => argv.includes(`--${k}`);
const arg = (k) => argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const num = (k) => { const v = arg(k); return v === undefined ? undefined : Number(v); };
const only = arg('only')?.split(',');
const agents = arg('agent') ? arg('agent').split(',') : ['analyste', 'stratege', 'moderateur'];
const limit = num('limit'), delay = num('delay'), maxRequests = num('max-requests');
const enforce = !flag('no-enforce');
const fail = (msg) => { console.error(msg); process.exit(1); };

for (const a of agents) if (!AGENT_NAMES.includes(a)) fail(`Agent inconnu : ${a} (attendu : ${AGENT_NAMES.join(', ')})`);
for (const [k, v] of Object.entries({ limit, delay, 'max-requests': maxRequests })) {
  if (v !== undefined && !(Number.isFinite(v) && v >= 0)) fail(`--${k} doit être un nombre positif`);
}

const fmtPrice = (p) => (Number.isFinite(p) ? (p === 0 ? 'gratuit' : p.toFixed(2).padStart(7)) : '      ?');

if (flag('list-openrouter')) {
  const all = await listOpenRouterModels();
  const rows = all.filter(m => m.textOnly && (!flag('free') || m.free)).sort((a, b) => b.created.localeCompare(a.created));
  console.log(`${rows.length} modèles OpenRouter${flag('free') ? ' gratuits' : ''} (prix en $ par million de jetons : entrée / sortie)`);
  console.log('id'.padEnd(58), 'contexte', 'entrée  ', 'sortie  ', 'sortie structurée', 'mode JSON', 'ajouté');
  for (const m of rows) {
    console.log(m.id.padEnd(58), String(m.context).padStart(8), fmtPrice(m.priceIn).padStart(8), fmtPrice(m.priceOut).padStart(8),
      (m.structured ? 'oui' : 'non').padEnd(17), (m.jsonMode ? 'oui' : 'non').padEnd(9), m.created);
  }
  process.exit(0);
}

const { models: configured, campaign_cost_target_usd: costTarget } = JSON.parse(readFileSync(join(BENCH_DIR, 'models.json'), 'utf8'));
const replaying = flag('replay') || arg('replay') !== undefined;
const sanitize = (s) => s.replace(/[^A-Za-z0-9._-]+/g, '-');

/** Modèles OpenRouter donnés à la main : prix lus dans l'API publique (0 pour une variante :free). */
async function adHocModels() {
  const ids = arg('model')?.split(',').filter(Boolean) ?? [];
  if (!ids.length) return [];
  const known = ids.every(id => id.endsWith(':free')) ? [] : await listOpenRouterModels();
  return ids.map(id => {
    const k = known.find(m => m.id === id);
    return { id: `or-${sanitize(id)}`, provider: 'openrouter', model: id, price: id.endsWith(':free') ? [0, 0] : [k?.priceIn ?? 0, k?.priceOut ?? 0], adHoc: true };
  });
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const summary = [];
const evaluations = [];
const startedAt = Date.now();

if (replaying) {
  // Rejeu : sorties enregistrées (baseline.json : { agent: { model: id, file: 'results/…json' } }).
  const baselineFile = typeof arg('replay') === 'string' && arg('replay') ? arg('replay') : join(BENCH_DIR, 'baseline.json');
  const baseline = JSON.parse(readFileSync(baselineFile, 'utf8'));
  for (const agent of agents) {
    const entry = baseline[agent];
    if (!entry) { console.log(`▶ ${agent} : pas de sortie de référence (baseline.json), ignoré`); continue; }
    if (only && !only.includes(entry.model)) continue;
    const records = JSON.parse(readFileSync(resolve(BENCH_DIR, entry.file), 'utf8'));
    const cases = casesFor(agent);
    const results = [];
    for (const c of cases) {
      const r = replayCase({ agent, c, record: records.find(x => x.id === c.id) });
      if (r) results.push(r);
    }
    console.log(`▶ ${agent} × ${entry.model} (rejeu de ${results.length} sorties enregistrées, aucun appel)`);
    for (const r of results) { const f = failedChecks(r); if (f.length) console.log(`  ${r.id} ✗ ${f.join(', ')}`); }
    const m = { id: entry.model };
    summary.push(summarize(agent, m, results, entry.prompt ?? promptFor(agent).version));
    evaluations.push({ agent, model: entry.model, ...evaluateThresholds(agent, results) });
    if (results.length < (entry.minCases ?? 1)) evaluations.at(-1).failures.push({ check: 'cas_rejoués', rate: results.length, required: entry.minCases });
  }
} else {
  const hasKey = (m) => process.env[providers[m.provider]?.key];
  const adHoc = await adHocModels();
  // Sans --only ni --model : seulement les modèles marqués `default` (réglages actuels), pour ne pas multiplier les requêtes.
  const active = [...configured.filter(m => (only ? only.includes(m.id) : !adHoc.length && m.default)), ...adHoc].filter(hasKey);
  if (!active.length) fail('Aucune clé API trouvée pour les modèles demandés. Remplis bench/.env (voir bench/.env.example) ou lance --replay.');

  // Budget de requêtes : borne haute avant de commencer, puis compteur strict.
  const plan = agents.reduce((n, a) => n + pickCases(casesFor(a), limit).length, 0) * active.length;
  console.log(`Plan : ${plan} requêtes au minimum (jusqu'à ${plan * 2} avec un nouvel essai) — ${active.length} modèle(s), agents ${agents.join(', ')}${limit ? `, ${limit} cas par agent` : ''}.`);
  if (maxRequests !== undefined && plan > maxRequests) console.log(`  --max-requests=${maxRequests} : le banc s'arrêtera avant de dépasser.`);
  if (active.some(m => m.provider === 'openrouter' && m.price[0] === 0 && m.price[1] === 0)) {
    const quota = await openRouterFreeQuota();
    if (quota) {
      console.log(`OpenRouter, requêtes gratuites : ${quota.used} utilisées sur ${quota.limit} aujourd'hui, ${quota.remaining} restantes.`);
      const freeCalls = plan;
      if (freeCalls > quota.remaining && !flag('force-quota')) fail(`Le plan (${freeCalls}) dépasse les requêtes gratuites restantes (${quota.remaining}). Réduis --limit ou ajoute --force-quota.`);
    }
  }

  let sent = 0;
  const call = async (m, system, user, opts) => {
    if (maxRequests !== undefined && sent >= maxRequests) { const e = new Error('plafond --max-requests atteint'); e.code = 'BUDGET_REACHED'; throw e; }
    if (delay) await new Promise(res => setTimeout(res, delay));
    sent += 1;
    return providers[m.provider].call(m.model, system, user, opts);
  };

  mkdirSync(join(BENCH_DIR, 'results'), { recursive: true });
  outer:
  for (const agent of agents) {
    const cases = pickCases(casesFor(agent), limit);
    const prompt = promptFor(agent);
    const { temperature } = agentConfig(agent);
    for (const m of active) {
      console.log(`▶ ${agent} (${prompt.version}) × ${m.id} (${cases.length} cas)`);
      const results = [];
      try {
        for (const c of cases) {
          const r = await runCase({ call, model: m, agent, c, system: prompt.text, temperature });
          const failed = failedChecks(r);
          console.log(`  ${c.id} ${failed.length ? '✗ ' + failed.join(', ') : '✓'}${r.error ? ' ERREUR ' + r.error : ''}`);
          results.push(r);
          if (results.length >= 3 && results.slice(-3).every(x => x.error)) {
            console.log(`  ⛔ 3 erreurs d'affilée : ${m.id} abandonné (clé, crédits, quota ou nom de modèle à vérifier)`);
            break;
          }
        }
      } catch (err) {
        if (err?.code !== 'BUDGET_REACHED') throw err;
        console.log(`  ⛔ ${err.message} (${sent} requêtes envoyées) : arrêt`);
        if (results.length) finish(agent, m, results, prompt);
        break outer;
      }
      finish(agent, m, results, prompt);
    }
  }
  console.log(`\n${sent} requête(s) réelle(s) envoyée(s).`);

  function finish(agent, m, results, prompt) {
    summary.push(summarize(agent, m, results, prompt.version));
    evaluations.push({ agent, model: m.id, ...evaluateThresholds(agent, results) });
    writeFileSync(join(BENCH_DIR, 'results', `${stamp}_${agent}_${sanitize(m.id)}.json`), JSON.stringify(results, null, 2));
  }
}

if (!summary.length) fail('Rien n\'a été noté.');

const verdict = (e) => (e.passed ? 'conforme' : 'SOUS LES SEUILS : ' + e.failures.map(f => `${f.check} ${Math.round(f.rate * 100)} % (< ${Math.round(f.required * 100)} %)`).join(', '));
const rows = summary.map((s, i) => `| ${s.agent} | ${s.prompt} | ${s.model} | **${s.score} %** | ${s.schema} | ${s.errors} | ${s.requests} | ${s.cost_per_call.toFixed(5)} $ | ${s.p50_ms} / ${s.p95_ms} | ${verdict(evaluations[i])} | ${s.failures.slice(0, 10).join(', ') || '—'} |`);
const report = `# Résultats du banc de test (${stamp}${replaying ? ', rejeu sans réseau' : ''}${limit ? `, ${limit} cas par agent` : ''})\n\n| Agent | Prompt | Modèle | Score auto | Schéma | Erreurs | Requêtes | Coût / appel | Latence p50/p95 (ms) | Seuils TR-AGT-05 | Échecs |\n|---|---|---|---|---|---|---|---|---|---|---|\n${rows.join('\n')}\n`;
const costReport = campaignCostReport(campaignCosts(summary, evaluations, costTarget), replaying);
if (!replaying) writeFileSync(join(BENCH_DIR, 'results', `${stamp}_rapport.md`), report + costReport);
console.log('\n' + report + costReport);
console.log(`Durée : ${Math.round((Date.now() - startedAt) / 1000)} s`);

const below = evaluations.filter(e => !e.passed);
if (below.length && enforce) {
  console.error(`\n✗ ${below.length} combinaison(s) agent × modèle sous les seuils : ${below.map(e => `${e.agent}/${e.model}`).join(', ')}`);
  process.exit(1);
}
if (below.length) console.log(`\n(${below.length} combinaison(s) sous les seuils, ignorées : --no-enforce)`);
