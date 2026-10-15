// Agent de démonstration pour les tests du moteur : aucun prompt réel, aucun modèle réel.
import { z } from 'zod';
import type { AgentDefinition } from './types';

export const demoInput = z.strictObject({ text: z.string().min(1) });
export const demoOutput = z.strictObject({
  label: z.enum(['a', 'b']),
  reason: z.string().min(1),
});
export type DemoInput = z.infer<typeof demoInput>;
export type DemoOutput = z.infer<typeof demoOutput>;

export function demoAgent(
  overrides: Partial<AgentDefinition<DemoInput, DemoOutput>> = {},
): AgentDefinition<DemoInput, DemoOutput> {
  return {
    name: 'analyste',
    promptVersion: 'analyste@test',
    model: 'test/modele-principal',
    fallbackModel: 'test/modele-secours',
    temperature: 0.2,
    inputSchema: demoInput,
    outputSchema: demoOutput,
    buildMessages: (input) => [
      { role: 'system', content: 'Réponds par un JSON.' },
      { role: 'user', content: input.text },
    ],
    ...overrides,
  };
}

export const VALID_OUTPUT: DemoOutput = { label: 'a', reason: 'Parce que.' };

/** Copie d'un objet sans une clé (pour tester l'absence d'une propriété facultative). */
export function omit<T extends object, K extends keyof T>(source: T, key: K): Omit<T, K> {
  const entries = Object.entries(source).filter(([name]) => name !== key);
  return Object.fromEntries(entries) as Omit<T, K>;
}
