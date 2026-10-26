// Règle d'accès côté écran (décision de la personne du 26/10/2026) : SEUL l'état « actif » écrit. La grâce de 3 jours (lecture, achat de
// crédits, pause), la lecture seule et la suspension de l'administration, et le verrouillage refusent l'écriture.
// L'écran ne fait que refléter l'état calculé par le serveur ; chaque route revérifie (`writable`).
export function isWritableStatus(status: string): boolean {
  return status === 'active';
}
