// Chemin interne sûr après connexion : un seul « / » en tête, sinon « / » (pas de redirection
// ouverte vers un autre site). Utilisé côté serveur (callback) et dans le formulaire de connexion.
export function safeNext(next: string | null | undefined): string {
  if (!next?.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/';
  return next;
}
