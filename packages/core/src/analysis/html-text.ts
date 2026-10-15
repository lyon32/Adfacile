// Extraction du texte d'une page HTML pour l'Analyste. Le résultat est une DONNÉE non fiable : il est ensuite
// encadré par `wrapUntrusted` et examiné par `detectInjection` (R8). Parcours en une seule passe avec `indexOf` :
// pas d'expression régulière imbriquée sur la page entière (pas de blocage sur une page piégée, EC-SRC-02).
// Garde : titre, description, textes visibles, `alt` des images, liens de contact (tel, WhatsApp, e-mail),
// données structurées JSON-LD. Retire : scripts, styles, commentaires, cadres, SVG.

const RAW_TEXT_TAGS = new Set([
  'script',
  'style',
  'noscript',
  'template',
  'svg',
  'iframe',
  'object',
]);
const BLOCK_TAGS = new Set([
  'p',
  'div',
  'section',
  'article',
  'header',
  'footer',
  'main',
  'nav',
  'aside',
  'ul',
  'ol',
  'li',
  'table',
  'tr',
  'td',
  'th',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'br',
  'hr',
  'blockquote',
  'pre',
  'form',
  'figure',
  'figcaption',
  'dl',
  'dt',
  'dd',
  'title',
  'button',
  'label',
  'option',
  'summary',
]);
const MAX_TAG_LENGTH = 6000;
const MAX_JSON_LD = 3;
const MAX_JSON_LD_CHARS = 4000;
const MAX_CONTACTS = 20;

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  euro: '€',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
  laquo: '«',
  raquo: '»',
  ndash: '–',
  mdash: '—',
  deg: '°',
  middot: '·',
  copy: '©',
  reg: '®',
  trade: '™',
  times: '×',
  agrave: 'à',
  aacute: 'á',
  acirc: 'â',
  auml: 'ä',
  ccedil: 'ç',
  egrave: 'è',
  eacute: 'é',
  ecirc: 'ê',
  euml: 'ë',
  igrave: 'ì',
  iacute: 'í',
  icirc: 'î',
  iuml: 'ï',
  ograve: 'ò',
  oacute: 'ó',
  ocirc: 'ô',
  ouml: 'ö',
  ugrave: 'ù',
  uacute: 'ú',
  ucirc: 'û',
  uuml: 'ü',
  Agrave: 'À',
  Eacute: 'É',
  Egrave: 'È',
  Ccedil: 'Ç',
  Ecirc: 'Ê',
  Ocirc: 'Ô',
  oelig: 'œ',
};

export function decodeEntities(text: string): string {
  return text.replace(
    /&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z][a-z0-9]{1,8});/gi,
    (whole, body: string) => {
      if (body.startsWith('#')) {
        const code =
          body[1]?.toLowerCase() === 'x'
            ? Number.parseInt(body.slice(2), 16)
            : Number(body.slice(1));
        if (
          !Number.isInteger(code) ||
          code <= 0 ||
          code > 0x10ffff ||
          (code >= 0xd800 && code <= 0xdfff)
        )
          return ' ';
        return String.fromCodePoint(code);
      }
      return ENTITIES[body] ?? ENTITIES[body.toLowerCase()] ?? whole;
    },
  );
}

/** Passe en minuscules les seules lettres ASCII : la longueur ne change jamais, les positions restent valables. */
function lowerAscii(text: string): string {
  return text.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));
}

function parseAttributes(source: string): Map<string, string> {
  const out = new Map<string, string>();
  const pattern = /([a-zA-Z_:][-\w:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const name = (match[1] ?? '').toLowerCase();
    if (!out.has(name)) out.set(name, decodeEntities(match[2] ?? match[3] ?? match[4] ?? ''));
  }
  return out;
}

/** Position du `>` qui ferme la balise commençant en `start`, en respectant les guillemets ; -1 si absent. */
function findTagEnd(html: string, start: number): number {
  let quote = '';
  const limit = Math.min(html.length, start + MAX_TAG_LENGTH);
  for (let i = start + 1; i < limit; i += 1) {
    const c = html[i];
    if (quote !== '') {
      if (c === quote) quote = '';
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '>') return i;
  }
  return -1;
}

const CONTACT_HREF =
  /^(tel:|mailto:|https?:\/\/(wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com|t\.me)\/)/i;

export interface PageText {
  title: string | null;
  description: string | null;
  contacts: string[];
  structured: string[];
  /** Texte visible, une ligne par bloc. */
  body: string;
}

export function extractPageText(html: string): PageText {
  const lower = lowerAscii(html);
  const body: string[] = [];
  const contacts = new Set<string>();
  const structured: string[] = [];
  const metas = new Map<string, string>();
  let title: string | null = null;
  let i = 0;

  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) {
      body.push(html.slice(i));
      break;
    }
    if (lt > i) body.push(html.slice(i, lt));
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4);
      if (end === -1) break;
      i = end + 3;
      continue;
    }
    const head = /^<(\/?)([a-zA-Z][a-zA-Z0-9-]*)/.exec(html.slice(lt, lt + 40));
    if (head === null) {
      body.push('<');
      i = lt + 1;
      continue;
    }
    const closing = head[1] === '/';
    const name = (head[2] ?? '').toLowerCase();
    const end = findTagEnd(html, lt);
    if (end === -1) break;
    const attrs = closing
      ? new Map<string, string>()
      : parseAttributes(html.slice(lt + head[0].length, end));
    i = end + 1;

    if (closing) {
      if (BLOCK_TAGS.has(name)) body.push('\n');
      continue;
    }
    if (name === 'meta') {
      const key = (attrs.get('property') ?? attrs.get('name') ?? '').toLowerCase();
      const content = attrs.get('content');
      if (key !== '' && content !== undefined && !metas.has(key)) metas.set(key, content);
      continue;
    }
    if (name === 'img') {
      const alt = attrs.get('alt');
      if (alt !== undefined && alt.trim() !== '') body.push(` ${alt} `);
      continue;
    }
    if (name === 'a') {
      const href = attrs.get('href')?.trim();
      if (href !== undefined && CONTACT_HREF.test(href) && contacts.size < MAX_CONTACTS) {
        contacts.add(href.slice(0, 200));
      }
    }
    if (RAW_TEXT_TAGS.has(name)) {
      const close = lower.indexOf(`</${name}`, i);
      const stop = close === -1 ? html.length : close;
      if (
        name === 'script' &&
        /ld\+json/i.test(attrs.get('type') ?? '') &&
        structured.length < MAX_JSON_LD
      ) {
        structured.push(html.slice(i, stop).trim().slice(0, MAX_JSON_LD_CHARS));
      }
      const after = close === -1 ? -1 : html.indexOf('>', close);
      i = after === -1 ? html.length : after + 1;
      continue;
    }
    if (name === 'title' && title === null) {
      const close = lower.indexOf('</title', i);
      const stop = close === -1 ? Math.min(html.length, i + 300) : close;
      title = decodeEntities(html.slice(i, stop)).replace(/\s+/g, ' ').trim().slice(0, 300) || null;
      const after = close === -1 ? -1 : html.indexOf('>', close);
      i = after === -1 ? stop : after + 1;
      continue;
    }
    if (BLOCK_TAGS.has(name)) body.push('\n');
  }

  const description = metas.get('og:description') ?? metas.get('description') ?? null;
  title ??= metas.get('og:title') ?? null;
  const lines = decodeEntities(body.join(''))
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .split('\n')
    .map((line) => line.replace(/[ \t ]+/g, ' ').trim())
    .filter((line, index, all) => line !== '' && line !== all[index - 1]);
  return {
    title,
    description:
      description === null
        ? null
        : decodeEntities(description).replace(/\s+/g, ' ').trim().slice(0, 500),
    contacts: [...contacts],
    structured,
    body: lines.join('\n'),
  };
}

/** Texte à donner à l'Analyste, tronqué à `maxChars`. */
export function pageToText(html: string, maxChars: number): string {
  const page = extractPageText(html);
  const parts: string[] = [];
  if (page.title !== null) parts.push(`Titre : ${page.title}`);
  if (page.description !== null) parts.push(`Description : ${page.description}`);
  if (page.contacts.length > 0)
    parts.push(`Liens de contact trouvés : ${page.contacts.join(' ; ')}`);
  if (page.structured.length > 0)
    parts.push(`Données structurées :\n${page.structured.join('\n')}`);
  if (page.body !== '') parts.push(page.body);
  return parts.join('\n\n').slice(0, maxChars);
}
