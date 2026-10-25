/** Lectures de refus restantes pour la passe (limite de débit de Meta, EC-META-10) : chaque `fetchRejection` réel en consomme une. */
export interface ReadBudget {
  left: number;
}

/** Réserve une lecture ; faux quand le budget est épuisé (la lecture est alors remise à la passe suivante). */
export function takeRead(budget: ReadBudget | undefined): boolean {
  if (budget === undefined) return true;
  if (budget.left <= 0) return false;
  budget.left -= 1;
  return true;
}
