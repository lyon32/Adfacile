// Jina Reader : lecture de secours d'une page que notre lecture interne n'a pas pu obtenir (EC-SRC-03).
// Service tiers : il ne reçoit QUE l'adresse publique déjà validée par `resolvePublicTarget` (jamais un texte
// du client, un fichier ou un nom d'utilisateur). La clé vient de l'environnement (`JINA_API_KEY`), jamais du code.
// Documentation : https://github.com/jina-ai/reader (README : « Using r.jina.ai », « JSON mode », en-têtes
// `x-retain-images`, `x-timeout`). Appel : POST https://r.jina.ai/ avec `url` dans le corps, `Accept: application/json`.
// Jina ne contourne pas une connexion obligatoire : si la page n'est pas publique, la source reste « illisible ».
import { z } from 'zod';

export const JINA_ENDPOINT = 'https://r.jina.ai/';
const MAX_RESPONSE_CHARS = 1_000_000;

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
        });
        if (!response.ok) return null;
        const text = (await response.text()).slice(0, MAX_RESPONSE_CHARS);
        const parsed = responseSchema.safeParse(JSON.parse(text));
        const content = parsed.success ? parsed.data.data?.content : null;
        return typeof content === 'string' && content.trim() !== '' ? content : null;
      } catch {
        return null;
      }
    },
  };
}
