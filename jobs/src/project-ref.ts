// Projet Trigger.dev visé par `jobs/trigger.config.ts`.
//
// Pourquoi une valeur par défaut : pendant `trigger deploy`, l'étape distante « indexer » de la construction évalue
// `trigger.config.ts` SANS les variables de la CI (constat du déploiement de préproduction du 15/10/2026). Lever une
// erreur à cet endroit fait échouer le déploiement. L'identifiant d'un projet n'est pas un secret : il figure déjà
// dans les documents du dépôt (CI_CD, ENV_SETUP).
// Le projet réellement visé est celui que la CLI résout en local : `--project-ref` ou `TRIGGER_PROJECT_REF`
// l'emportent sur la valeur du fichier (aide de `trigger deploy --project-ref`, vérifiée avec la CLI 4.6.4).
// Le projet de PRODUCTION ne sert JAMAIS de valeur par défaut : une erreur de variable ne doit pas viser la production.

/** Projet de préproduction `pubeka-staging` (son environnement prod sert de préproduction, CI_CD §4). */
export const STAGING_PROJECT_REF = 'proj_yhwiyrgxhyguhwepvopc';

export function resolveProjectRef(value: string | undefined): string {
  return value === undefined || value.trim() === '' ? STAGING_PROJECT_REF : value.trim();
}
