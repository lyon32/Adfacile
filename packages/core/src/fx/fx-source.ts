// Source des taux de change : une interface, deux implémentations (la vraie et la fausse des tests).
// Les taux sont des unités de monnaie locale pour 1 dollar américain (base USD).

/** Un relevé complet du fournisseur. */
export interface FxSnapshot {
  base: 'USD';
  /** Code ISO 4217 -> unités de monnaie pour 1 dollar. Inclut `USD` = 1. */
  rates: ReadonlyMap<string, number>;
  /** Heure de PUBLICATION des taux par le fournisseur (et non celle de notre lecture). */
  providerUpdatedAt: Date;
  /** Prochaine mise à jour annoncée par le fournisseur ; avant elle, rappeler ne sert à rien. */
  nextUpdateAt: Date | null;
  /** Fin de service annoncée du point d'accès, si le fournisseur en annonce une. */
  endOfLifeAt: Date | null;
}

export interface FxRateSource {
  /** Nom écrit dans `exchange_rates.source`. */
  readonly name: 'exchangerate-api';
  fetchLatest(): Promise<FxSnapshot>;
}

export type FxSourceErrorCode =
  | 'rate_limited' // HTTP 429 : le fournisseur bloque l'adresse 20 minutes
  | 'http_error'
  | 'provider_error' // result = "error"
  | 'invalid_response'
  | 'unavailable'; // réseau coupé, délai dépassé

/** Erreur d'une source : ne contient jamais le corps de la réponse ni l'adresse complète. */
export class FxSourceError extends Error {
  readonly code: FxSourceErrorCode;
  readonly status: number | undefined;

  constructor(code: FxSourceErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'FxSourceError';
    this.code = code;
    this.status = status;
  }
}
