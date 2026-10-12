// Identifiants déterministes pour les tests unitaires (TESTING §5.4) : même graine, même
// identifiant à chaque exécution. Forme d'un UUID v4 valide.
import { createHash } from 'node:crypto';

export function seededUuid(seed: string, n = 0): string {
  const h = createHash('sha256')
    .update(`${seed}:${String(n)}`)
    .digest('hex');
  const variant = ((parseInt(h.charAt(16), 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Suite d'identifiants : `const id = idSequence('campagne'); id(); id();` */
export function idSequence(seed: string): () => string {
  let n = 0;
  return () => seededUuid(seed, n++);
}
