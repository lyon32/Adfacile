// Interrupteur de sécurité de la publication réelle (S16). Quand Meta est RÉEL, créer ou activer une campagne dépense de l'argent
// réel : cela exige `PUBEKA_META_PUBLISH=enabled` (valeur exacte). Absent, vide ou autre valeur : DÉSACTIVÉ, par défaut et en
// production aussi (`env.ts` ne le force pas ; c'est le chef de projet qui le règle, quand il le décide).
// Avec la FAUSSE Meta (`PUBEKA_FAKE_PROVIDERS` contenant `meta`, ou `all`), rien n'est dépensé : l'interrupteur n'est pas exigé.
// La pause ARRÊTE la dépense : elle n'est jamais bloquée. La lecture reste libre.
import { AppError } from '@pubeka/contracts';
import type { Env } from '@pubeka/shared';
import { usesFakeMeta } from '../../meta/connector-factory';

export const PUBLISH_SWITCH_ENABLED = 'enabled';

export function metaPublishAllowed(
  env: Pick<Env, 'PUBEKA_FAKE_PROVIDERS' | 'PUBEKA_META_PUBLISH'>,
): boolean {
  return usesFakeMeta(env) || env.PUBEKA_META_PUBLISH === PUBLISH_SWITCH_ENABLED;
}

/** Ce que les cas d'usage reçoivent : une fonction (relue à chaque appel), jamais une valeur figée au démarrage. */
export interface MetaPublishGate {
  metaPublishEnabled: () => boolean;
}

/** 503 `provider_unavailable`, `meta.reason = publish_disabled` : l'écran dit que la publication réelle n'est pas activée. */
export function publishDisabledError(): AppError {
  return new AppError('provider_unavailable', {
    meta: { reason: 'publish_disabled' },
    cause: new Error('PUBEKA_META_PUBLISH n’est pas « enabled » alors que Meta est réel'),
  });
}

export function assertMetaPublishEnabled(gate: MetaPublishGate): void {
  if (!gate.metaPublishEnabled()) throw publishDisabledError();
}
