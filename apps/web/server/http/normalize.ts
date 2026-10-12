// Normalisation des textes reçus, avant la validation (SECURITY_NOTES §3.1 règle 3) :
// Unicode NFC → caractères de contrôle retirés (le retour à la ligne est gardé) → espaces
// retirés au début et à la fin. Les longueurs sont ensuite mesurées par le schéma.

// Contrôles C0 sauf \n, DEL et contrôles C1.
const CONTROL = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/g;

export function normalizeText(value: string): string {
  return value.normalize('NFC').replace(CONTROL, '').trim();
}

export function normalizeInput(value: unknown): unknown {
  if (typeof value === 'string') return normalizeText(value);
  if (Array.isArray(value)) return value.map(normalizeInput);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = normalizeInput(v);
    return out;
  }
  return value;
}
