// Extraction progressive des champs d'un JSON écrit au fil de l'eau : un champ n'est annoncé que COMPLET, dans l'ordre
// d'écriture, quel que soit le découpage du flux (aperçu non contractuel du Stratège, TR-PRF-05).
import { describe, expect, it } from 'vitest';
import { createFieldStream, type FieldEvent } from './field-stream';

function collect(chunks: readonly string[]): FieldEvent[] {
  const out: FieldEvent[] = [];
  const stream = createFieldStream((e) => out.push(e));
  for (const chunk of chunks) stream.push(chunk);
  return out;
}

const SAMPLE = JSON.stringify({
  objective: 'OUTCOME_ENGAGEMENT',
  objective_reason: 'Vous vendez sur WhatsApp : « écrivez-nous ».',
  geo: { countries: ['CI'], cities: [{ name: 'Abidjan', radius_km: 10 }] },
  budget: { daily_usd_cents: 400 },
  copy: { primary_text: 'Ligne 1\nLigne "2" 👟', description: null },
  advanced_targeting: { advantage_plus: true },
  warnings: [],
});

const EXPECTED: FieldEvent[] = [
  { path: 'objective', value: 'OUTCOME_ENGAGEMENT' },
  { path: 'objective_reason', value: 'Vous vendez sur WhatsApp : « écrivez-nous ».' },
  { path: 'geo.countries.0', value: 'CI' },
  { path: 'geo.cities.0.name', value: 'Abidjan' },
  { path: 'geo.cities.0.radius_km', value: 10 },
  { path: 'budget.daily_usd_cents', value: 400 },
  { path: 'copy.primary_text', value: 'Ligne 1\nLigne "2" 👟' },
  { path: 'copy.description', value: null },
  { path: 'advanced_targeting.advantage_plus', value: true },
];

describe('createFieldStream', () => {
  it('annonce chaque valeur simple, avec son chemin, dans l’ordre', () => {
    expect(collect([SAMPLE])).toEqual(EXPECTED);
  });

  it('caractère par caractère : exactement les mêmes événements', () => {
    expect(collect(Array.from(SAMPLE))).toEqual(EXPECTED);
  });

  it('découpages aléatoires (500 tirages) : exactement les mêmes événements', () => {
    let seed = 12345;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let round = 0; round < 500; round += 1) {
      const chunks: string[] = [];
      let at = 0;
      while (at < SAMPLE.length) {
        const size = 1 + Math.floor(random() * 12);
        chunks.push(SAMPLE.slice(at, at + size));
        at += size;
      }
      expect(collect(chunks)).toEqual(EXPECTED);
    }
  });

  it('un champ n’est annoncé que lorsqu’il est terminé', () => {
    const out: FieldEvent[] = [];
    const stream = createFieldStream((e) => out.push(e));
    stream.push('{"copy":{"headline":"Livraison gra');
    expect(out).toEqual([]);
    stream.push('tuite"');
    expect(out).toEqual([{ path: 'copy.headline', value: 'Livraison gratuite' }]);
  });

  it('un nombre n’est annoncé qu’au délimiteur suivant', () => {
    const out: FieldEvent[] = [];
    const stream = createFieldStream((e) => out.push(e));
    stream.push('{"a":12');
    expect(out).toEqual([]);
    stream.push('5,"b":-2.5e1}');
    expect(out).toEqual([
      { path: 'a', value: 125 },
      { path: 'b', value: -25 },
    ]);
  });

  it('séquences d’échappement : \\n, \\", \\\\, \\uXXXX et paire de substitution', () => {
    const events = collect(['{"t":"a\\nb \\"c\\" \\\\ \\u00e9 \\ud83d\\udc5f"}']);
    expect(events).toEqual([{ path: 't', value: 'a\nb "c" \\ é 👟' }]);
  });

  it('échappement coupé en plein milieu entre deux paquets', () => {
    expect(collect(['{"t":"x\\', 'u00', 'e9y"}'])).toEqual([{ path: 't', value: 'xéy' }]);
  });

  it('ignore le Markdown autour (```json … ```) et le texte avant l’accolade', () => {
    const events = collect(['Voici :\n```json\n{"a":1}', '\n```\nmerci']);
    expect(events).toEqual([{ path: 'a', value: 1 }]);
  });

  it('ignore tout ce qui suit la fin de l’objet', () => {
    expect(collect(['{"a":1}{"b":2}'])).toEqual([{ path: 'a', value: 1 }]);
  });

  it('tableaux imbriqués et vides, booléens, null', () => {
    expect(collect(['{"m":[[1,2],[],[true]],"n":null,"o":{}}'])).toEqual([
      { path: 'm.0.0', value: 1 },
      { path: 'm.0.1', value: 2 },
      { path: 'm.2.0', value: true },
      { path: 'n', value: null },
    ]);
  });

  it('flux tronqué : seuls les champs terminés sont annoncés, aucune exception', () => {
    const truncated = SAMPLE.slice(0, SAMPLE.indexOf('"budget"') + 20);
    const events = collect([truncated]);
    expect(events.at(-1)).toEqual({ path: 'geo.cities.0.radius_km', value: 10 });
  });

  it('JSON invalide : ne lève jamais, n’annonce rien de faux', () => {
    expect(() => collect(['{"a": tru', 'e}', '{{{[[[}}}', '"""'])).not.toThrow();
    expect(collect(['{"a": @@@, "b": 2}']).map((e) => e.path)).toEqual(['b']);
  });

  it('clé en double : les deux valeurs sont annoncées dans l’ordre', () => {
    expect(collect(['{"a":1,"a":2}'])).toEqual([
      { path: 'a', value: 1 },
      { path: 'a', value: 2 },
    ]);
  });

  it('une longue chaîne reste bornée : au-delà de la limite elle est ignorée, le reste continue', () => {
    const long = 'x'.repeat(20_000);
    const events = collect([`{"big":"${long}","after":1}`]);
    expect(events).toEqual([{ path: 'after', value: 1 }]);
  });

  it('profondeur bornée : un JSON absurdement imbriqué ne fait pas exploser la mémoire', () => {
    const events = collect(['{"a":' + '['.repeat(500) + '1' + ']'.repeat(500) + ',"z":9}']);
    expect(events.at(-1)).toEqual({ path: 'z', value: 9 });
  });
});
