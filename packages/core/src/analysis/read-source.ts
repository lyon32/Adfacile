// Lecture d'une source (LLD §6.11, APPFLOW §8.1) : lecture interne d'abord, Jina Reader en secours.
// Cas limites (SECURITY_NOTES §5.7) :
//   EC-SRC-01 adresse ou redirection vers l'interne : `unsafe_url`, avant toute connexion à cette adresse ;
//   EC-SRC-02 page très lourde ou qui ne finit jamais : lecture coupée, le texte déjà lu est utilisé s'il suffit ;
//   EC-SRC-03 site protégé contre les robots : Jina en secours, sinon « illisible ». On ne contourne JAMAIS la
//             protection : un seul essai, honnête (`PubekaBot`), aucun changement d'identité ni de proxy ;
//   EC-SRC-04 publication Facebook, Instagram ou X : illisible sans connexion, on propose une capture d'écran.
import { AppError } from '@pubeka/contracts';
import { pageToText } from './html-text';
import type { JinaReader } from './jina';
import { safeFetch } from './safe-fetch';
import type { Transport } from './node-transport';
import { resolvePublicTarget, type DnsResolver } from './safe-url';

/** LLD §6.11 : texte tronqué à 200 000 caractères. */
export const MAX_SOURCE_CHARS = 200_000;
/** En dessous, la page est considérée vide (page à rendu JavaScript, mur de connexion, erreur) : on passe au secours. */
export const MIN_READABLE_CHARS = 200;
/** Une page courte mais lisible (ex. une phrase d'accueil) reste utilisable si le secours n'a rien trouvé de mieux. */
const SHORT_BUT_USABLE_CHARS = 60;

export type SourceInput =
  { type: 'website' | 'app_link' | 'social_post'; url: string } | { type: 'text'; text: string };

export interface ReadSourceOptions {
  timeoutMs: number;
  maxBytes: number;
  maxChars?: number;
}

export interface ReadSourceDeps {
  resolve?: DnsResolver;
  transport?: Transport;
  /** Absent : pas de lecture de secours (clé `JINA_API_KEY` non fournie). */
  jina?: JinaReader | undefined;
}

export interface ReadSourceResult {
  text: string;
  extractor: 'internal' | 'jina';
  status: 'ok' | 'unreadable';
  /** Motif technique pour le journal (jamais affiché tel quel). */
  reason?: string;
}

/** Sites dont les publications exigent d'être connecté (EC-SRC-04). */
const LOGIN_WALLED = [
  'facebook.com',
  'fb.com',
  'fb.watch',
  'instagram.com',
  'x.com',
  'twitter.com',
];

function isLoginWalled(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return LOGIN_WALLED.some((site) => host === site || host.endsWith(`.${site}`));
}

const CHALLENGE_PAGE =
  /just a moment|attention required|verify you are (a )?human|captcha|enable javascript and cookies|access denied|checking your browser/i;

function isChallenge(status: number, headers: Record<string, string>, text: string): boolean {
  if (headers['cf-mitigated'] !== undefined) return true;
  return (
    (status === 403 || status === 429 || status === 503) &&
    CHALLENGE_PAGE.test(text.slice(0, 20_000))
  );
}

function decode(body: Uint8Array, contentType: string | null): string {
  let label = /charset=["']?([\w-]+)/i.exec(contentType ?? '')?.[1];
  if (label === undefined) {
    const head = new TextDecoder('latin1').decode(body.subarray(0, 2048));
    label = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1];
  }
  try {
    return new TextDecoder(label ?? 'utf-8').decode(body);
  } catch {
    return new TextDecoder('utf-8').decode(body);
  }
}

const READABLE_TYPES = /^(text\/html|application\/xhtml\+xml|text\/plain)\b/i;

/** Normalise un texte saisi par l'utilisateur : caractères de contrôle retirés, longueur bornée. */
export function cleanText(text: string, maxChars: number): string {
  return text
    .normalize('NFC')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, maxChars);
}

async function readInternal(
  url: string,
  options: ReadSourceOptions,
  deps: ReadSourceDeps,
): Promise<{ text: string; reason: string }> {
  try {
    const result = await safeFetch(url, {
      timeoutMs: options.timeoutMs,
      maxBytes: options.maxBytes,
      skipRedirectedHost: isLoginWalled,
      ...(deps.resolve === undefined ? {} : { resolve: deps.resolve }),
      ...(deps.transport === undefined ? {} : { transport: deps.transport }),
    });
    const readable = result.contentType === null || READABLE_TYPES.test(result.contentType);
    const raw = decode(result.body, result.contentType);
    if (isChallenge(result.status, result.headers, raw))
      return { text: '', reason: 'bot_protection' };
    if (result.status >= 400) return { text: '', reason: `http_${String(result.status)}` };
    if (!readable) return { text: '', reason: 'content_type' };
    return { text: pageToText(raw, options.maxChars ?? MAX_SOURCE_CHARS), reason: 'too_short' };
  } catch (error) {
    // Adresse refusée ou redirection vers l'interne : jamais « récupérée » par le secours (EC-SRC-01).
    if (error instanceof AppError && error.code === 'unsafe_url') throw error;
    const reason = error instanceof AppError ? error.opts.meta?.reason : undefined;
    return { text: '', reason: typeof reason === 'string' ? reason : 'error' };
  }
}

/** Attend `promise` au plus `ms` millisecondes ; sinon la source est illisible. */
async function raceDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new AppError('source_unreadable', { meta: { reason: 'timeout' } }));
    }, ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function readSource(
  source: SourceInput,
  options: ReadSourceOptions,
  deps: ReadSourceDeps = {},
): Promise<ReadSourceResult> {
  const maxChars = options.maxChars ?? MAX_SOURCE_CHARS;
  if (source.type === 'text') {
    const text = cleanText(source.text, maxChars);
    return { text, extractor: 'internal', status: text === '' ? 'unreadable' : 'ok' };
  }

  // Adresse validée AVANT tout, y compris avant d'en parler à Jina : le service tiers ne reçoit qu'une adresse publique.
  // Un seul délai global pour la lecture, la résolution et le secours (jamais 2 à 3 fois `timeoutMs`).
  const deadline = Date.now() + options.timeoutMs;
  const remaining = (): number => Math.max(1, deadline - Date.now());
  const target = await raceDeadline(
    resolvePublicTarget(source.url, deps.resolve),
    options.timeoutMs,
  );
  if (isLoginWalled(target.url.hostname)) {
    return { text: '', extractor: 'internal', status: 'unreadable', reason: 'login_required' };
  }

  const internal = await readInternal(source.url, { ...options, timeoutMs: remaining() }, deps);
  // Raccourci qui mène à Facebook, Instagram ou X : même règle que l'adresse de départ (EC-SRC-04), ni Jina ni requête.
  if (internal.reason === 'login_required') {
    return { text: '', extractor: 'internal', status: 'unreadable', reason: 'login_required' };
  }
  if (internal.text.length >= MIN_READABLE_CHARS) {
    return { text: internal.text, extractor: 'internal', status: 'ok' };
  }

  if (deps.jina !== undefined) {
    const viaJina = await deps.jina.read(target.url.toString(), AbortSignal.timeout(remaining()));
    const text = viaJina === null ? '' : cleanText(viaJina, maxChars);
    if (text.length >= MIN_READABLE_CHARS) return { text, extractor: 'jina', status: 'ok' };
  }
  // Un peu de texte interne vaut mieux que rien (page courte mais lisible, ex. une seule phrase d'accueil).
  if (
    internal.reason === 'too_short' &&
    internal.text.length >= SHORT_BUT_USABLE_CHARS &&
    !CHALLENGE_PAGE.test(internal.text)
  ) {
    return { text: internal.text, extractor: 'internal', status: 'ok' };
  }
  return { text: '', extractor: 'internal', status: 'unreadable', reason: internal.reason };
}
