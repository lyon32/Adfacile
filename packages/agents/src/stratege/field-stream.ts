// Extraction progressive des champs d'un JSON écrit au fil de l'eau (affichage progressif du Stratège, TR-PRF-05).
// Le modèle écrit la proposition fragment par fragment ; ce lecteur annonce chaque valeur SIMPLE (texte, nombre, booléen,
// null) dès qu'elle est terminée, avec son chemin (`copy.headline`, `geo.cities.0.name`), dans l'ordre d'écriture et quel que
// soit le découpage du flux. Ce n'est qu'un APERÇU : la proposition n'existe qu'après validation complète de la réponse
// finale (schéma, R3, ton…) ; rien d'ici n'est enregistré ni cru.
//
// Tolérant : un JSON cassé, du Markdown autour ou un flux tronqué ne lèvent jamais d'exception ; ce qui n'est pas
// compris est ignoré. Borné : une chaîne de plus de 10 000 caractères n'est pas annoncée, un champ à plus de 12 niveaux
// de profondeur non plus.

export interface FieldEvent {
  path: string;
  value: string | number | boolean | null;
}

const MAX_STRING = 10_000;
const MAX_PATH_DEPTH = 12;
const MAX_FRAMES = 10_000;
const MAX_BARE = 40;

type Frame =
  { kind: 'object'; key: string | null; expectKey: boolean } | { kind: 'array'; index: number };

const ESCAPES: Readonly<Record<string, string>> = {
  n: '\n',
  t: '\t',
  r: '\r',
  b: '\b',
  f: '\f',
  '/': '/',
  '\\': '\\',
  '"': '"',
};

const WHITESPACE = new Set([' ', '\t', '\n', '\r']);

export interface FieldStream {
  push(delta: string): void;
}

export function createFieldStream(onField: (event: FieldEvent) => void): FieldStream {
  const frames: Frame[] = [];
  let started = false;
  let finished = false;
  let mode: 'idle' | 'string' | 'bare' = 'idle';
  let str = {
    buf: '',
    isKey: false,
    escape: false,
    unicode: null as string | null,
    overflow: false,
  };
  let bare = '';

  const top = (): Frame | undefined => frames[frames.length - 1];

  function emit(value: FieldEvent['value']): void {
    if (frames.length > MAX_PATH_DEPTH) return;
    const segments: string[] = [];
    for (const frame of frames) {
      if (frame.kind === 'array') segments.push(String(frame.index));
      else if (frame.key === null) return;
      else segments.push(frame.key);
    }
    onField({ path: segments.join('.'), value });
  }

  function endBare(): void {
    const text = bare;
    bare = '';
    mode = 'idle';
    try {
      const value: unknown = JSON.parse(text);
      if (typeof value === 'number' || typeof value === 'boolean' || value === null) emit(value);
    } catch {
      // Valeur incomprise : ignorée.
    }
  }

  function endString(): void {
    mode = 'idle';
    const current = top();
    if (str.isKey) {
      if (current?.kind === 'object') {
        current.key = str.overflow ? null : str.buf;
        current.expectKey = false;
      }
      return;
    }
    if (!str.overflow) emit(str.buf);
  }

  function startString(): void {
    const current = top();
    str = {
      buf: '',
      isKey: current?.kind === 'object' && current.expectKey,
      escape: false,
      unicode: null,
      overflow: false,
    };
    mode = 'string';
  }

  function append(text: string): void {
    if (str.buf.length + text.length > MAX_STRING) str.overflow = true;
    else str.buf += text;
  }

  function inString(ch: string): void {
    if (str.unicode !== null) {
      str.unicode += ch;
      if (str.unicode.length === 4) {
        const code = Number.parseInt(str.unicode, 16);
        str.unicode = null;
        if (!Number.isNaN(code)) append(String.fromCharCode(code));
      }
      return;
    }
    if (str.escape) {
      str.escape = false;
      if (ch === 'u') str.unicode = '';
      else append(ESCAPES[ch] ?? ch);
      return;
    }
    if (ch === '\\') str.escape = true;
    else if (ch === '"') endString();
    else append(ch);
  }

  function idle(ch: string): void {
    if (WHITESPACE.has(ch)) return;
    switch (ch) {
      case '"':
        startString();
        return;
      case '{':
        if (frames.length < MAX_FRAMES) frames.push({ kind: 'object', key: null, expectKey: true });
        return;
      case '[':
        if (frames.length < MAX_FRAMES) frames.push({ kind: 'array', index: 0 });
        return;
      case '}':
      case ']':
        frames.pop();
        if (frames.length === 0) finished = true;
        return;
      case ',': {
        const current = top();
        if (current?.kind === 'object') {
          current.key = null;
          current.expectKey = true;
        } else if (current?.kind === 'array') current.index += 1;
        return;
      }
      case ':':
        return;
      default:
        bare = ch;
        mode = 'bare';
    }
  }

  function process(ch: string): void {
    if (finished) return;
    if (!started) {
      if (ch === '{') {
        started = true;
        frames.push({ kind: 'object', key: null, expectKey: true });
      }
      return;
    }
    if (mode === 'string') {
      inString(ch);
      return;
    }
    if (mode === 'bare') {
      if (WHITESPACE.has(ch) || ch === ',' || ch === '}' || ch === ']') {
        endBare();
        idle(ch);
      } else if (bare.length < MAX_BARE) bare += ch;
      return;
    }
    idle(ch);
  }

  return {
    push(delta: string): void {
      for (const ch of delta) process(ch);
    },
  };
}
