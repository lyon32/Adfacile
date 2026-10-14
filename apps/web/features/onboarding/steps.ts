// Les cinq étapes de la première configuration (APPFLOW §5). Les étapes 4 et 5 se passent.
export const STEPS = ['pays', 'langue', 'essai', 'meta', 'marque'] as const;
export type Step = (typeof STEPS)[number];

export function parseStep(value: string): Step | null {
  return STEPS.find((step) => step === value) ?? null;
}

export function stepNumber(step: Step): number {
  return STEPS.indexOf(step) + 1;
}

export function isSkippable(step: Step): boolean {
  return step === 'meta' || step === 'marque';
}

/** Adresse de l'étape suivante ; après la dernière, le tableau de bord. */
export function nextPath(step: Step): string {
  const next = STEPS[STEPS.indexOf(step) + 1];
  return next === undefined ? '/' : `/bienvenue/${next}`;
}
