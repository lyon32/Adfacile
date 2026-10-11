// Test des images du Designer : node bench/images.mjs [--model=gemini-3.1-flash-image] [--from=gemini-3-flash] [--limit=18] [--edit]
// 1. Génère la SCÈNE de chaque visuel (scene_prompt du dernier résultat Designer du modèle --from).
// 2. Option --edit : modification ciblée du fond sur la 1re image de chaque cas (test T3).
// 3. Écrit results/images/gallery.html : scène + calques posés par le code, pour jugement humain.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
for (const line of readFileSync(join(dir, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.+)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const MODEL = arg('model', 'gemini-3.1-flash-image');
const FROM = arg('from', 'gemini-3-flash');
const LIMIT = Number(arg('limit', 18));
const EDIT = process.argv.includes('--edit');
const out = join(dir, 'results', 'images', MODEL);
mkdirSync(out, { recursive: true });

const resDir = join(dir, 'results');
const file = readdirSync(resDir).filter(f => f.endsWith(`_designer_${FROM}.json`)).sort().pop();
if (!file) { console.error(`Aucun résultat Designer pour ${FROM}. Lance d'abord : node bench/run.mjs --agent=designer --only=${FROM}`); process.exit(1); }
const cases = JSON.parse(readFileSync(join(resDir, file), 'utf8'));
const inputs = Object.fromEntries(JSON.parse(readFileSync(join(dir, 'datasets', 'designer.json'), 'utf8')).map(c => [c.id, c]));

const SIZES = { '4:5': [864, 1080], '9:16': [720, 1280], '1:1': [1024, 1024], '1.91:1': [1200, 628] };

async function gen(parts, aspectRatio) {
  const t0 = Date.now();
  if (MODEL.startsWith('pollinations')) { // gratuit, sans clé, génération seule (pas de modification)
    if (parts.some(p => p.inlineData)) throw new Error('modification non prise en charge');
    const [w, h] = SIZES[aspectRatio] ?? [1024, 1024];
    const model = MODEL.split('-')[1] ?? 'flux';
    const res = await fetch(`https://image.pollinations.ai/prompt/${encodeURIComponent(parts[0].text)}?width=${w}&height=${h}&model=${model}&nologo=true&seed=7`);
    if (!res.ok) throw new Error(`${res.status}`);
    return { b64: Buffer.from(await res.arrayBuffer()).toString('base64'), ms: Date.now() - t0 };
  }
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio } } }),
  });
  const j = await res.json();
  const img = j.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
  if (!img) throw new Error(`${res.status} ${(j.error?.message ?? JSON.stringify(j)).slice(0, 160)}`);
  return { b64: img.inlineData.data, ms: Date.now() - t0 };
}

const items = [];
let n = 0, failures = 0;
for (const c of cases) {
  if (!c.out?.visuals) continue;
  for (const [i, v] of c.out.visuals.entries()) {
    if (n++ >= LIMIT) break;
    const name = `${c.id}_${i + 1}.${MODEL.startsWith("pollinations") ? "jpg" : "png"}`;
    const prompt = `${v.scene.scene_prompt}\nAvoid: ${v.scene.negative_prompt}`;
    try {
      const r = await gen([{ text: prompt }], v.format);
      writeFileSync(join(out, name), Buffer.from(r.b64, 'base64'));
      console.log(`✓ ${name} (${r.ms} ms)`);
      const item = { id: c.id, i, name, v, input: inputs[c.id] };
      if (EDIT && i === 0) {
        const instr = 'Change ONLY the background to a soft plain sand-beige studio wall. Keep the product, its position, size, lighting and every other element exactly identical. No text.';
        const e = await gen([{ inlineData: { mimeType: 'image/png', data: r.b64 } }, { text: instr }], v.format);
        const ename = `${c.id}_${i + 1}_edit.png`;
        writeFileSync(join(out, ename), Buffer.from(e.b64, 'base64'));
        item.edit = { name: ename, instr };
        console.log(`  ✓ modification ${ename} (${e.ms} ms)`);
      }
      items.push(item);
    } catch (err) {
      failures++;
      console.log(`✗ ${name} ${err.message}`);
      if (failures >= 3 && !items.length) { console.log('⛔ 3 échecs sans aucune image : quota ou facturation à vérifier.'); process.exit(1); }
    }
  }
}

// Galerie : la scène générée + les calques posés en HTML (comme le fera le vrai moteur de mise en page)
const ratio = { '4:5': '4 / 5', '9:16': '9 / 16', '1:1': '1 / 1', '1.91:1': '1.91 / 1' };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const card = (it, img) => {
  const colors = it.v.scene.palette ?? [];
  const layers = (it.v.scene.safe_areas ?? []).map(a => {
    const l = it.v.layers.find(x => x.role === a.role);
    if (!l?.text) return '';
    const [x0, y0, x1, y1] = a.box;
    const style = `left:${x0 * 100}%;top:${y0 * 100}%;width:${(x1 - x0) * 100}%;height:${(y1 - y0) * 100}%`;
    return `<div class="layer ${a.role}" style="${style};--accent:${colors[1] ?? '#f97316'}">${esc(l.text)}</div>`;
  }).join('');
  return `<figure><div class="frame" style="aspect-ratio:${ratio[it.v.format]}"><img src="${MODEL}/${img}">${layers}</div>
  <figcaption><b>${it.id} · ${esc(it.v.layout_id)}</b><br>${esc(it.v.concept)}</figcaption></figure>`;
};
const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Visuels Designer</title>
<style>body{font-family:system-ui,sans-serif;margin:16px;background:#f4f4f5;color:#18181b}h1{font-size:20px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:20px}
figure{margin:0;background:#fff;border-radius:10px;padding:10px;box-shadow:0 1px 3px #0002}
.frame{position:relative;overflow:hidden;border-radius:6px;background:#ddd}.frame img{width:100%;height:100%;object-fit:cover;display:block}
.layer{position:absolute;display:flex;align-items:center;justify-content:center;text-align:center;font-weight:800;color:#fff;text-shadow:0 1px 6px #0009;font-size:clamp(11px,2.6vw,17px);line-height:1.1}
.price{background:var(--accent);border-radius:999px;text-shadow:none}.cta{background:#fff;color:#111;border-radius:999px;text-shadow:none;font-size:12px}
.contact{font-size:11px;font-weight:600}figcaption{font-size:12px;margin-top:8px;color:#52525b}.pair{display:grid;grid-template-columns:1fr 1fr;gap:6px}</style>
<h1>Visuels générés : ${MODEL} (directions : ${FROM})</h1>
<p>Note chaque visuel de 1 à 5 : « utilisable tel quel ? ». Les textes sont posés par le code, pas par l'IA.</p>
<div class="grid">${items.map(it => card(it, it.name)).join('')}</div>
${items.some(i => i.edit) ? `<h1>Test de modification ciblée (fond seulement)</h1><div class="grid">${items.filter(i => i.edit).map(it => `<figure><div class="pair"><img src="${MODEL}/${it.name}" width="100%"><img src="${MODEL}/${it.edit.name}" width="100%"></div><figcaption>${it.id} · avant / après. Seul le fond doit changer.</figcaption></figure>`).join('')}</div>` : ''}`;
writeFileSync(join(dir, 'results', 'images', `gallery_${MODEL}.html`), html);
console.log(`\n${items.length} images · galerie : bench/results/images/gallery_${MODEL}.html`);
