// Vérifications des webhooks Meta (API_SPEC §12, SECURITY_NOTES §3.4). Documentation :
// https://developers.facebook.com/docs/graph-api/webhooks/getting-started
// - abonnement (GET) : `hub.verify_token` comparé en temps constant, puis `hub.challenge` renvoyé ;
// - événements (POST) : `X-Hub-Signature-256` = « sha256= » + HMAC-SHA256 du corps BRUT avec le
//   secret de l'application ; vérifié avant toute lecture du JSON.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/** Égalité en temps constant de deux textes (empreintes de même longueur comparées). */
export function safeEqualText(a: string, b: string): boolean {
  const left = createHash('sha256').update(a, 'utf8').digest();
  const right = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(left, right);
}

/** `hub.verify_token` reçu contre `META_WEBHOOK_VERIFY_TOKEN` ; jamais vrai si le jeton n'est pas configuré. */
export function verifyTokenMatches(given: string, expected: string | undefined): boolean {
  if (expected === undefined || expected === '') return false;
  return safeEqualText(given, expected);
}

/** `X-Hub-Signature-256` valide pour ce corps brut ; faux sans secret, sans en-tête ou mal formé. */
export function verifyMetaSignature(
  rawBody: string,
  header: string | null,
  appSecret: string | undefined,
): boolean {
  if (appSecret === undefined || appSecret === '' || header === null) return false;
  const match = /^sha256=([0-9a-f]{64})$/i.exec(header.trim());
  if (match?.[1] === undefined) return false;
  const given = Buffer.from(match[1], 'hex');
  const expected = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest();
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Meta n'envoie pas d'identifiant d'événement : l'empreinte du corps signé en tient lieu (rejeu = même empreinte). */
export function webhookEventId(rawBody: string): string {
  return createHash('sha256').update(rawBody, 'utf8').digest('hex');
}
