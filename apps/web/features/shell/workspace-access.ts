// Règle d'accès côté écran : la grâce reste modifiable (SECURITY_NOTES §2.1) ; lecture seule et suspension non.
// L'écran ne fait que refléter l'état calculé par le serveur ; chaque route revérifie (`writable`).
export function isWritableStatus(status: string): boolean {
  return status === 'active' || status === 'grace';
}
