// Clé d'idempotence d'une génération en cours, gardée par campagne dans sessionStorage : un rechargement de la page (ou un
// retour sur l'étape) pendant l'écriture reprend la MÊME génération au lieu d'en payer une seconde (API_SPEC §7, TR-SEC-IDEMP).
// C'est une commodité par onglet : le stockage peut être absent ou refusé (navigation privée), on ne s'y fie jamais.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function storageKey(campaignId: string): string {
  return `pubeka:proposal-key:${campaignId}`;
}

export function loadPendingKey(campaignId: string): string | null {
  try {
    const value = window.sessionStorage.getItem(storageKey(campaignId));
    return value !== null && UUID.test(value) ? value : null;
  } catch {
    return null;
  }
}

export function savePendingKey(campaignId: string, key: string): void {
  try {
    window.sessionStorage.setItem(storageKey(campaignId), key);
  } catch {
    // Stockage indisponible : la reprise après rechargement n'est simplement pas offerte.
  }
}

export function clearPendingKey(campaignId: string): void {
  try {
    window.sessionStorage.removeItem(storageKey(campaignId));
  } catch {
    // Rien à nettoyer.
  }
}
