// `api()` des routes réelles : dépendances lues à chaque requête (variables validées par getEnv).
import { createApi } from './api';
import { realApiDeps } from './deps';

export const api = createApi(realApiDeps);
