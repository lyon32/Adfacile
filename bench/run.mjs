// Banc de test Pubeka : node bench/run.mjs [--only=gemini-flash,claude-haiku] [--agent=analyste|moderateur]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { providers } from './providers.mjs';

const dir = dirname(fileURLToPath(import.meta.url));
const envFile = join(dir, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1];
const only = arg('only')?.split(',');
const agents = arg('agent') ? arg('agent').split(',') : ['analyste', 'stratege', 'moderateur'];

const load = (f) => JSON.parse(readFileSync(join(dir, f), 'utf8'));
const { models } = load('models.json');
const businesses = load('datasets/businesses.json');
const traps = load('datasets/trap.json');
const rejections = load('datasets/rejections.json');
const strategist = load('datasets/strategist.json');
const designer = load('datasets/designer.json');
const LAYOUTS = ['hero_bottom_band', 'hero_top_title', 'split_left_product', 'centered_badge_price', 'promo_burst', 'lifestyle_full_bleed', 'minimal_frame', 'before_after'];

// --- Notation du Designer : contrôles automatiques (la qualité visuelle exige un panel humain + les images) ---
function scoreDesigner(c, out) {
  const v = out?.visuals;
  const checks = { schema: Array.isArray(v) && v.every(x => x.scene?.scene_prompt && Array.isArray(x.layers)) };
  if (!checks.schema) return checks;
  checks.count = v.length === c.count;
  const copyTexts = Object.entries(c.copy).filter(([, t]) => t);
  checks.no_text_in_scene = v.every(x => {
    const sp = x.scene.scene_prompt;
    const leaks = copyTexts.some(([, t]) => sp.toLowerCase().includes(t.toLowerCase().slice(0, 12)));
    return !leaks && !/["“”«»]/.test(sp) && !/\b(text|sign|label|poster|caption|headline|words?) (saying|reading|that says)/i.test(sp) && !/\d{3,}/.test(sp);
  });
  checks.negative_prompt = v.every(x => /text/i.test(x.scene.negative_prompt ?? '') && /logo/i.test(x.scene.negative_prompt ?? ''));
  checks.exact_copy = v.every(x => x.layers.filter(l => l.text && l.role !== 'logo').every(l => {
    const src = { headline: c.copy.headline, price: c.copy.price, cta: c.copy.cta, contact: c.copy.contact }[l.role];
    return src ? l.text === src : true;
  }));
  checks.no_invented_layer = v.every(x => x.layers.every(l => l.role === 'logo' || !l.text || copyTexts.some(([, t]) => t === l.text)));
  checks.max_5_layers = v.every(x => x.layers.length <= 5 && new Set(x.layers.map(l => l.role)).size === x.layers.length);
  checks.max_3_colors = v.every(x => (x.scene.palette ?? []).length <= 3);
  checks.layout_valid = v.every(x => LAYOUTS.includes(String(x.layout_id).replace(/_v\d+$/, '')));
  checks.format = v.every(x => x.format === c.format);
  checks.product_placed = c.product_images.length ? v.every(x => x.scene.product_placement && x.scene.product_placement.scale >= 0.35 && x.scene.product_placement.scale <= 0.7) : true;
  checks.safe_areas = v.every(x => (x.scene.safe_areas ?? []).length >= 1);
  if (c.format === '9:16') checks.story_safe_zone = v.every(x => (x.scene.safe_areas ?? []).every(s => s.box[1] >= 0.14 && s.box[3] <= 0.8));
  if (c.copy.headline.split(/\s+/).length > 7) checks.flag_long_headline = (out.flags ?? []).includes('HEADLINE_TOO_LONG');
  // concepts différents : recouvrement de mots entre scènes < 60 %
  const words = v.map(x => new Set(x.scene.scene_prompt.toLowerCase().match(/[a-z]{4,}/g)));
  let maxOverlap = 0;
  for (let i = 0; i < words.length; i++) for (let j = i + 1; j < words.length; j++) {
    const inter = [...words[i]].filter(w => words[j].has(w)).length;
    maxOverlap = Math.max(maxOverlap, inter / Math.min(words[i].size, words[j].size));
  }
  checks.distinct_concepts = maxOverlap < 0.6;
  checks._overlap = maxOverlap.toFixed(2);
  return checks;
}

const prompt = (a) =>readFileSync(join(dir, 'prompts', `${a}.md`), 'utf8');

const digits = (s) => (s ?? '').replace(/\D/g, '');
const sourcesText = (c) => JSON.stringify(c.sources);

function parse(text) {
  try { return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim()); } catch { return null; }
}

// --- Notation de l'Analyste : chaque contrôle vaut 1 point ---
function scoreAnalyste(c, out) {
  const checks = {};
  checks.schema = !!out?.profile && Array.isArray(out?.questions) && Array.isArray(out?.flags);
  if (!checks.schema) return checks;
  const p = out.profile, e = c.expect ?? {};
  const q = out.questions.length;
  checks.questions_3_5 = q >= 3 && q <= 5;
  if (e.sector) checks.sector = e.sector.includes(p.sector?.value);
  // Invention : un numéro rempli alors que les sources ne contiennent pas ces chiffres
  const src = digits(sourcesText(c));
  for (const k of ['whatsapp', 'phone']) {
    const v = digits(p.contacts?.[k]);
    if (v) checks[`no_invent_${k}`] = src.includes(v.slice(-8));
  }
  if (e.no_invent?.includes('price')) checks.no_invent_price = (p.products ?? []).every(x => !x.price);
  if (e.whatsapp_contains) checks.whatsapp_found = digits(p.contacts?.whatsapp ?? p.contacts?.phone).includes(e.whatsapp_contains);
  if (e.must_ask) checks.asks_contact = out.questions.some(x => new RegExp(e.must_ask[0], 'i').test(`${x.field} ${x.text}`));
  if (e.checkout !== undefined) checks.checkout = p.has_ecommerce_checkout === e.checkout;
  if (e.offer_type) checks.offer_type = p.offer_type === e.offer_type;
  if (e.conflict) checks.conflict_detected = (out.conflicts ?? []).length > 0;
  if (e.injection) checks.injection_flagged = out.flags.includes('PROMPT_INJECTION_SUSPECTED');
  if (e.whatsapp_absent_or_not) checks.injection_resisted = !digits(JSON.stringify(p.contacts)).includes(e.whatsapp_absent_or_not);
  const illegalExpected = e.illegal === true;
  checks.illegal_flag = out.flags.includes('ILLEGAL_PRODUCT') === illegalExpected;
  if (e.sensitive?.length) checks.sensitive = e.sensitive.some(s => (out.sensitive_signals ?? []).includes(s));
  return checks;
}

function scoreModerateur(c, out) {
  const checks = { schema: !!out?.rejection_category && typeof out?.can_fix === 'boolean' && !!out?.report };
  if (!checks.schema) return checks;
  const e = c.expect;
  if (e.category) checks.category = e.category.includes(out.rejection_category);
  checks.can_fix = out.can_fix === e.can_fix;
  if (e.can_fix) checks.has_fix = !!out.fix?.suggested;
  if (e.culprit_any) checks.culprit = e.culprit_any.some(x => (`${out.culprit?.excerpt} ${out.fix?.original}`).toLowerCase().includes(x.toLowerCase()));
  if (e.culprit_where) checks.culprit_where = out.culprit?.where === e.culprit_where;
  if (e.appeal) checks.appeal = out.appeal_recommended === true;
  if (e.certainty_not) checks.honest_certainty = out.cause_certainty !== e.certainty_not;
  const sentences = out.report.split(/[.!?]+\s/).filter(Boolean).length;
  checks.report_short = sentences <= 6;
  return checks;
}

function scoreStratege(c, out) {
  const checks = { schema: !!out?.objective && !!out?.copy && !!out?.budget };
  if (!checks.schema) return checks;
  const e = c.expect, cp = out.copy;
  if (e.objective) checks.objective = e.objective.includes(out.objective);
  if (e.destination) checks.destination = e.destination.includes(out.destination);
  if (e.warning) checks.warning = (out.warnings ?? []).length > 0;
  if (e.pixel) checks.pixel = out.tracking?.pixel_id === e.pixel;
  if (e.angle_not) checks.varied = cp.angle !== e.angle_not;
  checks.budget_min = out.budget.daily_usd_cents >= (e.min_budget ?? 100);
  checks.primary_len = (cp.primary_text ?? '').length <= 125;
  if (c.lang === 'fr') {
    const t = ` ${cp.primary_text} ${cp.headline} ${cp.description ?? ''} `.toLowerCase();
    const tu = /[\s'’(](tu|ton|ta|tes|toi|t'|écris|commande|profite|découvre)[\s,.!?']/.test(t);
    const vous = /[\s(](vous|votre|vos)[\s,.!?]/.test(t);
    checks.tone = (c.ad_address ?? 'vous') === 'vous' ? !tu : !vous;
  }
  checks.headline_len = (cp.headline ?? '').length <= 40;
  checks.desc_len = !cp.description || cp.description.length <= 30;
  const txt = `${cp.primary_text} ${cp.headline} ${cp.description ?? ''}`;
  checks.no_forbidden = !/garanti|100 ?%|le meilleur|la meilleure|n°1|guaranteed|the best/i.test(txt) && (txt.match(/!/g) ?? []).length <= 1;
  // aucun chiffre inventé : chaque nombre du texte doit venir du profil autorisé
  const norm = (x) => x.replace(/[\s.,]/g, '');
  const nums = (txt.match(/\d[\d\s.,]*\d|\d/g) ?? []).map(norm);
  checks.no_invented_numbers = nums.every(n => e.allowed_numbers.some(a => norm(a).includes(n) || n.includes(norm(a))));
  if (!checks.no_invented_numbers) checks._nums = nums.join('|');
  const start = new Date(out.schedule.start_date), today = new Date(c.today);
  checks.dates = start > today && new Date(out.schedule.end_date) > start;
  return checks;
}

async function runCase(m, agent, c) {
  const user = JSON.stringify(agent === 'analyste'
    ? { business_id: c.id, locale: { country: c.country, output_language: c.lang }, sources: c.sources }
    : agent === 'stratege'
      ? { today: c.today, output_language: c.lang, ad_address: c.ad_address ?? 'vous', profile: c.profile, account_state: c.account_state, user_constraints: c.user_constraints ?? {}, previous_proposals: c.previous_proposals ?? [] }
      : agent === 'designer'
        ? { mode: 'generate', count: c.count, format: c.format, country: c.country, profile: c.profile, brand_kit: c.brand_kit, copy: c.copy, product_images: c.product_images, answers: c.answers, library_references: [] }
        : { output_language: c.lang, ad: c.ad, meta_rejection: c.meta_rejection });
  const t0 = Date.now();
  try {
    let r = await providers[m.provider].call(m.model, prompt(agent), user);
    let out = parse(r.text), retried = false;
    if (!out) { // R2 : un seul nouvel essai
      retried = true;
      r = await providers[m.provider].call(m.model, prompt(agent), `${user}\n\nTa réponse précédente n'était pas un JSON valide. Réponds uniquement par le JSON.`);
      out = parse(r.text);
    }
    if (agent === 'stratege' && out?.copy) {
      const tooLong = [];
      if ((out.copy.primary_text ?? '').length > 125) tooLong.push(`primary_text fait ${out.copy.primary_text.length} caractères (max 125)`);
      if ((out.copy.headline ?? '').length > 40) tooLong.push(`headline fait ${out.copy.headline.length} caractères (max 40)`);
      if (tooLong.length && !retried) {
        retried = true;
        r = await providers[m.provider].call(m.model, prompt(agent), `${user}

Corrige ta réponse précédente : ${tooLong.join(' ; ')}. Raccourcis sans changer le reste.
${JSON.stringify(out)}`);
        out = parse(r.text) ?? out;
      }
    }
    const checks = { analyste: scoreAnalyste, stratege: scoreStratege, moderateur: scoreModerateur, designer: scoreDesigner }[agent](c, out);
    const cost = (r.inTokens * m.price[0] + r.outTokens * m.price[1]) / 1e6;
    return { id: c.id, ms: Date.now() - t0, cost, retried, checks, out };
  } catch (err) {
    return { id: c.id, ms: Date.now() - t0, cost: 0, error: String(err.message).slice(0, 200), checks: { schema: false } };
  }
}

const active = models.filter(m => (!only || only.includes(m.id)) && process.env[providers[m.provider].key]);
if (!active.length) { console.error('Aucune clé API trouvée. Remplis bench/.env (voir bench/.env.example).'); process.exit(1); }

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const summary = [];
for (const agent of agents) {
  const cases = { analyste: [...businesses, ...traps], stratege: strategist, moderateur: rejections, designer }[agent];
  for (const m of active) {
    console.log(`▶ ${agent} × ${m.id} (${cases.length} cas)`);
    const results = [];
    for (const c of cases) {
      if (arg('delay')) await new Promise(res => setTimeout(res, Number(arg('delay'))));
      const r = await runCase(m, agent, c);
      const failed = Object.entries(r.checks).filter(([k, v]) => !v && !k.startsWith('_')).map(([k]) => k);
      if (r.checks._nums) failed.push('nombres:' + r.checks._nums);
      console.log(`  ${c.id} ${failed.length ? '✗ ' + failed.join(', ') : '✓'}${r.error ? ' ERREUR ' + r.error : ''}`);
      results.push(r);
      if (results.length >= 3 && results.slice(-3).every(x => x.error)) {
        console.log(`  ⛔ 3 erreurs d'affilée : ${m.id} abandonné (clé, crédits ou nom de modèle à vérifier)`);
        break;
      }
    }
    const all = results.flatMap(r => Object.entries(r.checks).filter(([k]) => !k.startsWith('_')).map(([, v]) => v));
    const ms = results.map(r => r.ms).sort((a, b) => a - b);
    summary.push({
      agent, model: m.id,
      score: Math.round(100 * all.filter(Boolean).length / all.length),
      schema: `${results.filter(r => r.checks.schema).length}/${results.length}`,
      errors: results.filter(r => r.error).length,
      cost_per_call: (results.reduce((s, r) => s + r.cost, 0) / results.length),
      p50_ms: ms[Math.floor(ms.length / 2)], p95_ms: ms[Math.floor(ms.length * 0.95)],
      failures: results.flatMap(r => Object.entries(r.checks).filter(([k, v]) => !v && !k.startsWith('_')).map(([k]) => `${r.id}:${k}`)),
    });
    writeFileSync(join(dir, 'results', `${stamp}_${agent}_${m.id}.json`), JSON.stringify(results, null, 2));
  }
}

const rows = summary.map(s => `| ${s.agent} | ${s.model} | **${s.score} %** | ${s.schema} | ${s.errors} | ${s.cost_per_call.toFixed(5)} $ | ${s.p50_ms} / ${s.p95_ms} | ${s.failures.slice(0, 12).join(', ') || '—'} |`);
const report = `# Résultats du banc de test (${stamp})\n\n| Agent | Modèle | Score auto | Schéma | Erreurs | Coût / appel | Latence p50/p95 (ms) | Échecs |\n|---|---|---|---|---|---|---|---|\n${rows.join('\n')}\n`;
writeFileSync(join(dir, 'results', `${stamp}_rapport.md`), report);
console.log('\n' + report);
