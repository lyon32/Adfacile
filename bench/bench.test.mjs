// Tests du banc des agents (S13). Aucun réseau, aucune clé : l'appel au modèle est une fausse fonction
// (TESTING §6.1 : la CI n'appelle jamais un vrai service payant). Lancés par `pnpm bench:test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AGENT_NAMES, AGENTS_SRC, agentConfig, campaignCostReport, campaignCosts, casesFor, pickCases, promptFor, runCase } from './engine.mjs';
import { evaluateThresholds } from './scoring.mjs';

const RUN = fileURLToPath(new URL('./run.mjs', import.meta.url));
const model = { id: 'fake', provider: 'fake', model: 'fake/fake', price: [1, 2] };

test('TR-AGT-01 : JSON invalide deux fois, le banc s\'arrête à 2 appels (jamais un 3e)', async () => {
  let calls = 0;
  const call = async () => { calls += 1; return { text: 'pas du json', inTokens: 10, outTokens: 5 }; };
  const [c] = casesFor('moderateur');
  const r = await runCase({ call, model, agent: 'moderateur', c, system: 'x' });
  assert.equal(calls, 2);
  assert.equal(r.calls, 2);
  assert.equal(r.checks.schema, false);
});

test('TR-AGT-01 : un JSON valide dès le premier appel ne coûte qu\'un appel', async () => {
  let calls = 0;
  const call = async () => { calls += 1; return { text: '{"unrelated":true}', inTokens: 1, outTokens: 1 }; };
  const [c] = casesFor('moderateur');
  const r = await runCase({ call, model, agent: 'moderateur', c, system: 'x' });
  assert.equal(calls, 1);
  assert.equal(r.retried, false);
});

test('TR-AGT-01 : Stratège aux textes trop longs, un seul nouvel essai puis fin', async () => {
  let calls = 0;
  const long = JSON.stringify({ copy: { primary_text: 'a'.repeat(200), headline: 'b'.repeat(80) } });
  const call = async () => { calls += 1; return { text: long, inTokens: 1, outTokens: 1 }; };
  const [c] = casesFor('stratege');
  await runCase({ call, model, agent: 'stratege', c, system: 'x' });
  assert.equal(calls, 2);
});

test('TR-AGT-01 : JSON invalide puis Stratège trop long, toujours 2 appels au plus', async () => {
  let calls = 0;
  const call = async () => {
    calls += 1;
    return { text: calls === 1 ? 'oups' : JSON.stringify({ copy: { primary_text: 'a'.repeat(200) } }), inTokens: 1, outTokens: 1 };
  };
  const [c] = casesFor('stratege');
  await runCase({ call, model, agent: 'stratege', c, system: 'x' });
  assert.equal(calls, 2);
});

test('une panne du fournisseur n\'est pas rejouée (résultat incertain)', async () => {
  let calls = 0;
  const call = async () => { calls += 1; throw new Error('503 indisponible'); };
  const [c] = casesFor('analyste');
  const r = await runCase({ call, model, agent: 'analyste', c, system: 'x' });
  assert.equal(calls, 1);
  assert.match(r.error, /503/);
});

test('le coût d\'un cas vient du coût facturé, sinon des jetons et du prix du modèle', async () => {
  const [c] = casesFor('moderateur');
  const billed = await runCase({ call: async () => ({ text: '{}', inTokens: 1e6, outTokens: 1e6, cost: 0.0123 }), model, agent: 'moderateur', c, system: 'x' });
  assert.equal(billed.cost, 0.0123);
  const priced = await runCase({ call: async () => ({ text: '{}', inTokens: 1e6, outTokens: 5e5 }), model, agent: 'moderateur', c, system: 'x' });
  assert.equal(priced.cost, 1 * 1 + 0.5 * 2);
});

test('--limit : N cas répartis sur le jeu, sans doublon', () => {
  const cases = Array.from({ length: 50 }, (_, i) => ({ id: `c${i}` }));
  const picked = pickCases(cases, 5);
  assert.equal(picked.length, 5);
  assert.equal(picked[0].id, 'c0');
  assert.equal(picked.at(-1).id, 'c49');
  assert.equal(new Set(picked.map(p => p.id)).size, 5);
  assert.equal(pickCases(cases, 1).length, 1);
  assert.equal(pickCases(cases, undefined).length, 50);
  assert.equal(pickCases(cases, 99).length, 50);
});

test('les prompts des 4 agents sont dans packages/agents et aucun n\'écrit un modèle en dur', () => {
  for (const agent of AGENT_NAMES) {
    const p = promptFor(agent);
    assert.match(p.version, new RegExp(`^${agent}@\\d+$`));
    assert.ok(p.text.length > 200);
    assert.doesNotMatch(p.text, /gemini|gemma|claude|gpt|deepseek|qwen|mistral/i, `${agent} : nom de modèle dans le prompt`);
    assert.ok(Number.isFinite(agentConfig(agent).temperature));
  }
  assert.ok(AGENTS_SRC.endsWith('agents' + (AGENTS_SRC.includes('\\') ? '\\' : '/') + 'src'));
});

test('seuils TR-AGT-05 : un modèle sous un seuil est refusé', () => {
  const ok = { checks: { schema: true, can_fix: true } };
  assert.equal(evaluateThresholds('moderateur', [ok, ok]).passed, true);
  const bad = evaluateThresholds('moderateur', [ok, { checks: { schema: true, can_fix: false } }]);
  assert.equal(bad.passed, false);
  assert.equal(bad.failures[0].check, 'can_fix');
  const err = evaluateThresholds('moderateur', [ok, { checks: { schema: false } }]);
  assert.equal(err.passed, false);
});

test('coût par campagne : Analyste + Stratège, Modérateur à part, objectif signalé', () => {
  const row = (agent, m, cost) => ({ agent, model: m, cost_per_call: cost });
  const summary = [row('analyste', 'a', 0.01), row('stratege', 'a', 0.02), row('moderateur', 'a', 0.005), row('analyste', 'b', 0.002), row('stratege', 'b', 0.09)];
  const evaluations = [{ passed: true }, { passed: true }, { passed: true }, { passed: true }, { passed: false }];
  const costs = campaignCosts(summary, evaluations, 0.05);
  assert.deepEqual(costs.single.map(s => [s.model, Number(s.usd.toFixed(3))]), [['a', 0.03], ['b', 0.092]]);
  assert.equal(costs.single[1].overTarget, true);
  assert.equal(costs.single[1].passed, false);
  assert.deepEqual([costs.combo.analyste, costs.combo.stratege], ['b', 'a']);
  assert.equal(Number(costs.combo.usd.toFixed(3)), 0.022);
  assert.equal(costs.moderator.usd, 0.005);
  const text = campaignCostReport(costs, false);
  assert.match(text, /Coût par campagne/);
  assert.match(text, /AU-DESSUS/);
  assert.match(campaignCostReport(costs, true), /non calculé en rejeu/);
});

test('le banc en rejeu réussit sur les sorties enregistrées, sans réseau ni clé', () => {
  const r = spawnSync(process.execPath, [RUN, '--replay'], { encoding: 'utf8', env: { PATH: process.env.PATH, BENCH_ENV_FILE: join(tmpdir(), 'inexistant.env') } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /conforme/);
  assert.doesNotMatch(r.stdout, /SOUS LES SEUILS/);
});

test('le banc échoue (code 1) quand une sortie enregistrée passe sous les seuils', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bench-'));
  const base = JSON.parse(readFileSync(new URL('./baseline.json', import.meta.url), 'utf8'));
  const records = JSON.parse(readFileSync(new URL(`./${base.moderateur.file}`, import.meta.url), 'utf8'));
  // can_fix faux partout : sous le seuil de 100 %.
  const broken = records.map(r => ({ ...r, out: { ...r.out, can_fix: !r.out.can_fix } }));
  writeFileSync(join(dir, 'moderateur.json'), JSON.stringify(broken));
  writeFileSync(join(dir, 'baseline.json'), JSON.stringify({ moderateur: { model: 'casse', prompt: 'moderateur@2', file: join(dir, 'moderateur.json'), minCases: 1 } }));
  const r = spawnSync(process.execPath, [RUN, `--replay=${join(dir, 'baseline.json')}`, '--agent=moderateur'], { encoding: 'utf8' });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout + r.stderr, /SOUS LES SEUILS|sous les seuils/);
});

test('sans clé, le banc réel refuse de partir (code 1) au lieu de ne rien noter', () => {
  const r = spawnSync(process.execPath, [RUN, '--agent=moderateur'], { encoding: 'utf8', env: { PATH: process.env.PATH, BENCH_ENV_FILE: join(tmpdir(), 'inexistant.env') } });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Aucune clé API/);
});
