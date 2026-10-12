// Traduction des erreurs PostgreSQL / PostgREST en `AppError` de la liste fermée (API_SPEC §4).
import { AppError } from '@pubeka/contracts';

export interface PgError {
  code?: string | undefined;
  message: string;
}

/** Codes SQLSTATE levés par nos fonctions (migration 0003) et par les contraintes. */
export function toAppError(error: PgError): AppError {
  switch (error.code) {
    case 'P0002':
      return new AppError('not_found', { cause: error });
    case '42501':
      return new AppError('forbidden', { cause: error });
    case '22023':
    case '23514':
      return new AppError('validation_failed', { cause: error });
    case '23505':
      return new AppError('conflict', { cause: error });
    case undefined:
    default:
      return new AppError('internal_error', { cause: error });
  }
}

/** Renvoie les données, ou lève l'erreur traduite si la réponse en contient une. */
export function unwrap<T>(res: { data: T; error: null } | { data: null; error: PgError }): T {
  if (res.error !== null) throw toAppError(res.error);
  return res.data;
}

/** Une ligne attendue : absente (autre espace, RLS, identifiant inconnu) → `not_found`. */
export function one<T>(res: { data: T | null; error: PgError | null }): T {
  if (res.error !== null) throw toAppError(res.error);
  if (res.data === null) throw new AppError('not_found');
  return res.data;
}

/** Pour un appel sans résultat : lève l'erreur traduite s'il y en a une. */
export function check(res: { error: PgError | null }): void {
  if (res.error !== null) throw toAppError(res.error);
}
