// Reconnaissance de la référence de publication de Pubeka dans le nom d'une campagne chez la plateforme (EC-META-05).
// Une seule définition, partagée par le vrai connecteur et la fausse Meta : la fausse ne peut pas mentir sur la règle.

const escapeRegExp = (text: string): string =>
  text.replaceAll(/[.*+?^${}()|[\]\\]/g, (char) => `\\${char}`);

/** Longueur minimale d'une référence : plus court, elle correspondrait à n'importe quelle campagne. */
export const MIN_REFERENCE_LENGTH = 6;

/** Le nom contient la référence, qui n'est pas suivie d'un chiffre (« …-1 » n'est pas « …-10 »). */
export function nameHasReference(name: string, reference: string): boolean {
  const wanted = reference.trim();
  if (wanted.length < MIN_REFERENCE_LENGTH) return false;
  return new RegExp(`${escapeRegExp(wanted)}(?![0-9])`).test(name);
}
