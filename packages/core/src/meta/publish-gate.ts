// Défense en profondeur de l'interrupteur de publication réelle (S16). Les cas d'usage (publish, tâche, resume, relaunch)
// vérifient déjà `PUBEKA_META_PUBLISH` ; ce décorateur le vérifie AUSSI autour du connecteur Meta RÉEL : si un chemin de code
// l'oubliait un jour, aucune écriture qui CRÉE ou ACTIVE (donc qui dépense) ne partirait vers Meta.
// Bloqué : `createCampaign` (campagne, ensemble de publicités, création, publicité), `resume` (activation) et `updateCampaign`
// (un budget relevé dépense plus). Permis : toutes les lectures, l'estimation, la recherche de lieux, `pause` (elle ARRÊTE la
// dépense) et `deleteCampaign` (suppression d'orphelins PAUSED). Refus : 503 `provider_unavailable`, `meta.reason: publish_disabled`.
import type { PlatformConnector } from '@pubeka/platforms';
import { publishDisabledError } from '../campaigns/publish/publish-switch';

const BLOCKED: ReadonlySet<PropertyKey> = new Set(['createCampaign', 'resume', 'updateCampaign']);

export function guardPublishWrites<T extends PlatformConnector>(
  connector: T,
  allowed: () => boolean,
): T {
  return new Proxy(connector, {
    get(target, key) {
      const value: unknown = Reflect.get(target, key, target);
      if (typeof value !== 'function') return value;
      if (BLOCKED.has(key)) {
        return (...args: unknown[]): Promise<unknown> => {
          if (!allowed()) return Promise.reject(publishDisabledError());
          return Promise.resolve((value as (...a: unknown[]) => unknown).apply(target, args));
        };
      }
      return (value as (...a: unknown[]) => unknown).bind(target);
    },
  });
}
