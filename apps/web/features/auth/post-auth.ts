// Appel des actions de connexion (POST /auth/*) depuis un formulaire, sur un clic : jamais dans
// un useEffect. Renvoie l'issue métier, ou « unavailable » si le serveur n'a pas répondu.
import { z } from 'zod';

export const OUTCOMES = [
  'ok',
  'invalid_credentials',
  'locked',
  'email_not_confirmed',
  'captcha_failed',
  'email_taken',
  'weak_password',
  'rate_limited',
  'link_expired',
  'unavailable',
] as const;
export type Outcome = (typeof OUTCOMES)[number];

const ResponseSchema = z.object({ outcome: z.enum(OUTCOMES) });

export async function postAuth(path: string, body: Record<string, unknown>): Promise<Outcome> {
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'same-origin',
    });
    const parsed = ResponseSchema.safeParse(await res.json());
    if (parsed.success) return parsed.data.outcome;
    return res.status === 429 ? 'rate_limited' : 'unavailable';
  } catch {
    return 'unavailable';
  }
}
