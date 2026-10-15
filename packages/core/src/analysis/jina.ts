// Jina Reader : lecture de secours d'une page que notre lecture interne n'a pas pu obtenir (EC-SRC-03).
// Service tiers : il ne reçoit QUE l'adresse publique déjà validée par `resolvePublicTarget` (jamais un texte
// du client, un fichier ou un nom d'utilisateur). La clé vient de l'environnement (`JINA_API_KEY`), jamais du code.
// Documentation : https://github.com/jina-ai/reader (README : « Using r.jina.ai », « JSON mode », en-têtes
// `x-retain-images`, `x-timeout`). Appel : POST https://r.jina.ai/ avec `url` dans le corps, `Accept: application/json`.
// Jina ne contourne pas une connexion obligatoire : si la page n'est pas publique, la source reste « illisible ».
import { z } from 'zod';

export const JINA_ENDPOINT = 'https://r.jina.ai/';
const MAX_RESPONSE_BYTES = 2_000_000;

/** Lit le corps par morceaux et s'arrête au plafond (rend `null` s'il est dépassé). */
async function readLimited(response: Response, maxBytes: number): Promise<string | null> {
  const reader: ReadableStreamDefaultReader<Uint8Array> | undefined = response.body?.getReader();
  if (reader === undefined) return null;
  const decoder = new TextDecoder();
  let total = 0;
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

export interface JinaReader {
  /** Texte de la page, ou `null` si Jina n'a rien pu lire. Ne lève jamais d'erreur (secours silencieux). */
  read(publicUrl: string, signal: AbortSignal): Promise<string | null>;
}

const responseSchema = z.object({
  data: z.object({ content: z.string().nullable().optional() }).optional(),
});

export function createJinaReader(options: {
  apiKey: string;
  fetchImpl?: typeof fetch;
}): JinaReader {
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    async read(publicUrl, signal) {
      try {
        const response = await fetchImpl(JINA_ENDPOINT, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${options.apiKey}`,
            accept: 'application/json',
            'content-type': 'application/json',
            'x-retain-images': 'none',
          },
          body: JSON.stringify({ url: publicUrl }),
          signal,
          // Jamais de redirection : la clé ne doit pas suivre une réponse vers un autre hôte.
          redirect: 'error',
        });
        if (!response.ok) return null;
        const declared = Number(response.headers.get('content-length') ?? '0');
        if (declared > MAX_RESPONSE_BYTES) return null;
        const text = (await readLimited(response, MAX_RESPONSE_BYTES)) ?? '';
        const parsed = responseSchema.safeParse(JSON.parse(text));
        const content = parsed.success ? parsed.data.data?.content : null;
        return typeof content === 'string' && content.trim() !== '' ? content : null;
      } catch {
        return null;
      }
    },
  };
}
