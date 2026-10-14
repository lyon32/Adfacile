// Contrôle i18n:check : mêmes clés, aucune valeur vide, mêmes variables { } (TESTING §4.2).
export function flatten(node: Record<string, unknown>, prefix = '') {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    if (typeof value === 'object' && value !== null)
      Object.assign(out, flatten(value as Record<string, unknown>, path));
    else out[path] = value;
  }
  return out;
}

function placeholders(text: unknown): string {
  return [...String(text).matchAll(/\{(\w+)\}/g)]
    .map((m) => m[1])
    .sort()
    .join(',');
}

export function compare(fr: Record<string, unknown>, en: Record<string, unknown>): string[] {
  const problems: string[] = [];
  for (const key of Object.keys(fr)) {
    if (!(key in en)) problems.push(`EN manquant : ${key}`);
  }
  for (const key of Object.keys(en)) {
    if (!(key in fr)) problems.push(`FR manquant : ${key}`);
  }
  const tables: [string, Record<string, unknown>][] = [
    ['FR', fr],
    ['EN', en],
  ];
  for (const [lang, table] of tables) {
    for (const [key, value] of Object.entries(table)) {
      if (typeof value !== 'string' || value.trim() === '') problems.push(`${lang} vide : ${key}`);
    }
  }
  for (const key of Object.keys(fr)) {
    if (key in en && placeholders(fr[key]) !== placeholders(en[key])) {
      problems.push(`Variables différentes : ${key}`);
    }
  }
  return problems;
}
