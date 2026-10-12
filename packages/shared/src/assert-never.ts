/** Fin d'un `switch` exhaustif : un cas oublié ne compile pas (CONVENTIONS §2.2). */
export function assertNever(value: never): never {
  throw new Error(`Valeur inattendue : ${String(value)}`);
}
