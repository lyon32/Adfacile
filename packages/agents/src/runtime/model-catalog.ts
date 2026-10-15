// Capacités des modèles : un modèle voit-il les images ? L'Analyste reçoit des photos (APPFLOW §8.1) ; si le modèle
// réglé pour lui ne les accepte pas, il faut le dire clairement AVANT l'appel (aucune dépense, aucun silence).
// La réponse vient d'OpenRouter, jamais d'une liste de noms écrite dans le code : `architecture.input_modalities` de
// la liste publique des modèles (https://openrouter.ai/docs/api-reference/list-available-models , sans clé).
import { z } from 'zod';

export interface ModelCatalog {
  /** `true` : accepte les images ; `false` : texte seul ; `null` : inconnu (liste indisponible ou modèle absent). */
  acceptsImages(model: string): Promise<boolean | null>;
}

const modelsSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      architecture: z.object({ input_modalities: z.array(z.string()).optional() }).optional(),
    }),
  ),
});

export interface OpenRouterModelCatalogOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Durée de conservation de la liste en mémoire (la liste change rarement). Défaut : 1 heure. */
  ttlMs?: number;
  timeoutMs?: number;
  now?: () => number;
}

export class OpenRouterModelCatalog implements ModelCatalog {
  private cache: { at: number; images: Map<string, boolean> } | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;

  constructor(private readonly options: OpenRouterModelCatalogOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.baseUrl = (options.baseUrl ?? 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
  }

  async acceptsImages(model: string): Promise<boolean | null> {
    const now = (this.options.now ?? Date.now)();
    if (this.cache === undefined || now - this.cache.at > (this.options.ttlMs ?? 3_600_000)) {
      const images = await this.load();
      if (images === null) return this.cache?.images.get(model) ?? null;
      this.cache = { at: now, images };
    }
    return this.cache.images.get(model) ?? null;
  }

  private async load(): Promise<Map<string, boolean> | null> {
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/models`, {
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 10_000),
      });
      if (!response.ok) return null;
      const parsed = modelsSchema.safeParse(await response.json());
      if (!parsed.success) return null;
      return new Map(
        parsed.data.data.map((m) => [
          m.id,
          m.architecture?.input_modalities?.includes('image') === true,
        ]),
      );
    } catch {
      return null;
    }
  }
}

/** Catalogue fixe pour les tests et le mode « fausse passerelle » : tout modèle absent est inconnu. */
export class StaticModelCatalog implements ModelCatalog {
  constructor(
    private readonly images: Record<string, boolean>,
    private readonly otherwise: boolean | null = null,
  ) {}

  acceptsImages(model: string): Promise<boolean | null> {
    return Promise.resolve(this.images[model] ?? this.otherwise);
  }
}
