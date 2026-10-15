# Journal de construction — Pubeka

> Tenu par l'agent chef de projet en mode continu ([ROADMAP §8](ROADMAP.md#8-mode-continu--enchaîner-les-sessions-jusquà-la-fin)). Une entrée par session fusionnée, la plus récente en haut.
> Lis d'abord **Questions en attente** : c'est ce qui attend ta réponse.

## Questions en attente

| Session | Question ou action 👤 | Depuis le |
|---|---|---|
| S07 | 👤 Créer les identifiants Google OAuth et Apple (Services ID et clé), puis les mettre dans `supabase/.env` ; marche à suivre dans la PR #13 | 2026-10-12 |

## Décisions de la personne

| Date | Session | Décision |
|---|---|---|
| 2026-10-12 | S03 | E10 : le déclencheur d'inscription ne crée **pas** l'essai. L'essai (abonnement `trialing`, crédits `trial`) démarre au clic sur [Commencer] de `/bienvenue/essai` (APPFLOW §5, étape 3) et sera fait en S24. LLD §10 et la fiche S03 sont corrigés. Contradiction relevée par le sous-agent S03 : LLD E10 contre APPFLOW étape 3. |
| 2026-10-12 | S04 | D-1 : CAPTCHA **Cloudflare Turnstile**. Google et Apple passent par Supabase Auth (docs supabase.com/docs/guides/auth/social-login/auth-google et auth-apple). S04 démarre avec de faux fournisseurs ; la connexion devient réelle quand la personne ajoute les identifiants (👤, avant S07). |

## Sessions terminées

### S13 · Tâches de fond et moteur des agents — ✅ 2026-10-15
- **PR** : #56, #57, #58 (fusionnées en squash, dernier commit ee18cd6), puis #59 (correctif de l'indexation Trigger.dev, 296048f). Les premières PR #53 à #55 ont été fermées et remplacées par #56 à #58 (voir « Problèmes »).
- **Fait** : `packages/agents/src/runtime` : `runAgent` (au plus 2 appels, jamais un 3ᵉ), `wrapUntrusted`, `detectInjection`, journal `AgentRunRecord`, `FakeAiGateway`, `OpenRouterGateway` ; modèle de chaque agent = réglage (`models.json` surchargé par `AGENT_MODELS`), avec modèle de repli. `jobs/` : `trigger.config.ts`, 4 files (`media-fal` 2, `media-higgsfield` 20, `media-byteplus-video` 3, `agents` 5), `InlineJobDispatcher` et `TriggerJobDispatcher` avec clé d'idempotence, tâche `system.ping`. Prompts déplacés de `bench/prompts` vers `packages/agents/src/<agent>/prompts/` (octet pour octet). Banc réécrit pour OpenRouter, avec **coût par campagne** (Analyste + Stratège, comparé à l'objectif de 0,05 $).
- **Preuves** : TR-AGT-01 prouvé (`run-agent.test.ts` compte les appels du faux : 2 maximum, même avec une 3ᵉ réponse prête) ; agents 100 % des lignes, 96,8 % des branches ; `jobs` 16 tests, 97,7 % des lignes ; 13 tests du banc (`bench:test`) + rejeu (`bench:replay`) dans la CI, sans réseau ni clé ; **`trigger dev`** (15/10/2026, environnement DEV du projet `pubeka-staging`) : `system.ping` exécuté en 13 ms (run `run_06gk08g44a1brhdo2rdiv09701`), relancé avec la même clé d'idempotence il renvoie le même run (`isCached true`), sans nouvelle exécution, une autre clé crée un nouveau run ; **déploiement de préproduction** sur `main` (296048f) : migrations, Trigger.dev, Vercel et 6 tests de fumée en vert ; « CI terminée » verte.
- **Décision D-2** (15/10/2026, la personne) : passerelle IA texte = **OpenRouter** (pas Vercel AI Gateway). Variable `OPENROUTER_API_KEY` ; `AI_GATEWAY_API_KEY` retirée. ROADMAP §5, ARCHITECTURE, ENV_SETUP et LLD mis à jour.
- **Exigence produit** (15/10/2026, la personne) : la page d'administration (S31) doit montrer si chaque agent fonctionne, changer le modèle de chaque agent dans une liste prédéfinie avec un modèle de repli, et définir une clé d'API par agent (OpenRouter par défaut), sans redéploiement. Déjà prête côté moteur : `AgentConfigSource` (`EnvAgentConfigSource` en S13), `applyAgentConfig`, `provider` et `apiKey` par appel, `AgentKeyStore.resolve`, clé jamais dans le journal ni les erreurs (testé). **Non réalisé** : appel direct Anthropic, OpenAI ou Gemini (la passerelle répond `bad_request`), stockage chiffré des clés, colonnes `error_code`, `provider`, `requested_model`, `attempts` de la table `agent_runs` (nouvelle migration à créer avec le premier écrivain, S14, ou en S31), écran.
- **Premiers essais réels OpenRouter** (10 requêtes, quota gratuit du jour consommé) : `gemma-4-31b-it:free` : JSON valide sur 1 cas, 26 s, 429 sur le cas piège ; `gemma-4-26b-a4b-it:free` : 429 « limité en amont », non évaluable ; `deepseek/deepseek-v4-flash` (payant, 1 cas par agent) : Analyste, Stratège et Modérateur à 100 %, JSON valide au premier appel, **0,00075 $ par campagne** mesuré (environ 70 fois sous l'objectif de 0,05 $), mais 55 s pour l'Analyste. **Un cas par agent ne suffit pas pour retenir un modèle.** Le banc complet reste à faire avec des crédits OpenRouter ; rapport consolidé des résultats d'octobre (Gemini, Gemma, Mistral) généré par la session (`Rapport-banc-des-agents.html`, non versionné).
- **Problèmes et cause** : (1) **gitleaks** (`generic-api-key`) a signalé une fausse clé de test dans `agent-config.test.ts` ; plutôt qu'un force-push ou une liste d'exceptions, la valeur est maintenant fabriquée à l'exécution et le travail a été repoussé sous de nouvelles branches `-v2` (nouvelles PR #56 à #58, anciennes fermées, aucune branche supprimée). (2) La CLI Trigger.dev 4.6.4 expose la commande `trigger`, pas `trigger.dev` : `deploy-staging.yml` et `release.yml` corrigés. (3) `@depot/cli: true` ajouté à `pnpm-workspace.yaml` (sinon `ERR_PNPM_IGNORED_BUILDS`). (4) **L'indexation distante de Trigger.dev évalue `trigger.config.ts` sans les variables de la CI** : le fichier plantait (`TRIGGER_PROJECT_REF est absente`) et bloquait toute la mise en ligne de préproduction ; correctif #59 : valeur par défaut = projet de préproduction (jamais la production), la CLI visant le projet de la variable ou de `--project-ref`. La documentation Trigger.dev ne décrit pas ce cas ; constat tiré du journal du déploiement. (5) Mon script de fusion a plusieurs fois suivi le mauvais lancement de CI (le banc « vrais modèles » sauté) ; il s'arrête maintenant sans fusionner tant que « CI terminée » n'est pas verte.
- **Décisions prises** : les deux modes d'exécution (`inline`, interdit en production, et `trigger`) ; aucune relance automatique des tâches qui dépensent (`maxAttempts` 1, EC-META-05) ; files `agents` à 5 et `media-fal` à 2 en attendant mesure (S14, S21) ; le banc réel (`agents-bench.yml`) est coupé tant que la variable de dépôt `PUBEKA_BENCH_REAL` ne vaut pas `true` (**TR-AGT-04 : « tout changement de prompt repasse le banc » n'est donc pas appliqué en CI avant activation, avec son coût**) ; le modèle de secours passe par le champ `models` d'OpenRouter, dans la même requête. **Décision de la personne à prendre avant la production (S36)** : confidentialité des modèles gratuits `:free` (leurs fournisseurs peuvent enregistrer les textes envoyés, c'est-à-dire les sites et documents des clients) ; réglage `OPENROUTER_DATA_COLLECTION`, options dans ARCHITECTURE §16.
- **Remarqué hors périmètre** : `.env.example` à la racine parle encore d'AdFacile (reste de S12) ; `release.yml` n'a pas `TRIGGER_PROJECT_REF` dans son environnement (à ajouter en S36) ; les règles ESLint de LLD §3 interdisent à `web` et à `core` d'importer `@pubeka/jobs` : le premier consommateur de `createJobDispatcher` (S16 ou S21) devra trancher entre autoriser l'arête ou déclarer un port dans `core` ; `pnpm dev` ne lance pas `trigger dev` (pas de script `dev` dans `jobs`) ; `@depot/cli` a un script d'installation autorisé sur la CI qui détient `TRIGGER_ACCESS_TOKEN` : risque faible, à relire à chaque montée de version de `trigger.dev` ; la CLI 4.7.4 est sortie, on reste en 4.6.4 exacte ; le jeton Meta est toujours dans l'URL de certaines requêtes (hérité de S10).


### S12 · Retrait de l'ancien code AdFacile — ✅ 2026-10-15
- **PR** : #51 (fusionnée en squash)
- **Fait** : 209 fichiers suivis supprimés : `src/` (108), `backend/` (89), `public/`, `index.html`, `vite.config.ts`, `tsconfig.app.json`, `tsconfig.node.json`, fichiers Docker, `nginx.conf`, `render.yaml` ; `.prettierignore` et `.vercelignore` nettoyés. `logs/`, `tmp/` et `supabase/snippets/` n'étaient pas suivis par git (rien à retirer) ; le `vercel.json` racine avait déjà été remplacé en S01 et S07.
- **Preuves** : table élément par élément dans la PR (`git grep` sur tout le dépôt, `package.json`, `turbo.json`, workflows, `apps/web`, `packages/*`, `jobs/`, `supabase/`) : aucune référence vivante ; `install --frozen-lockfile`, `format:check`, `lint`, `typecheck`, `test`, `build`, `test:routes-coverage` (29 opérations) et `openapi:lint` verts ; « CI terminée » verte sur 2e47498.
- **Tests AdFacile disparus** : portés en S10 (config, `facebookAdsService`, `createFullCampaign`, `campaignStatus`, `campaignObjectives`, `campaignValidation`, `facebookErrors`, `mediaSpecs`, `adAccountTime`, `facebookPixels`, `facebookTokenHealth`, `messagingDestinations`, `getAuthUrl`, `adAccountSwitch` côté connecteur) ; portés en S11 (`oauthState`, `facebookAccount`, parties base d'`adAccountSwitch` et `facebookController`) ; à porter en S14 (`uploadMedia`, route `uploads`), S16 (`campaignDelete`, `campaignJobs*`), S17 (`facebookInsightsService`, `ttlCache`), S25 (`billingWebhook`, `saspayService`) ; abandonnés : `cors` (remplacé par le contrôle d'`Origin` de S05), 2 tests de `src/utils`.
- **Décisions prises** : seuls les éléments de LLD §2.3 sont retirés ; `scripts/`, `README.md`, `AUTO.md`, `.dockerignore`, l'en-tête de `CLAUDE.md`, `bench/` et `docs/meta/` n'y figurent pas et sont laissés. Les lignes non ancrées de `.prettierignore` (`index.html`, `vite.config.ts`, `tsconfig.*.json`) sont gardées : elles couvrent `packages/ui` et `packages/config`.
- **Remarqué hors périmètre** : scripts cassés car ils chargent `backend/` ou `src/` : `scripts/audit-ventes.cjs`, `essai-formats.cjs`, `relire-campagne.cjs`, `sonde-pixels.cjs`, `sonde-ventes.cjs` ; `scripts/verifier-suppression.cjs` et `scripts/tunnel-dev.mjs` visent `backend/.env` (à retirer ou réécrire : décision de la personne) ; `docs/meta/reference-ventes.json` et `reference-trafic.md` citent `backend/src/services/…` ; documents périmés : `README.md`, `AUTO.md`, `.dockerignore`, en-tête « État du dépôt » de `CLAUDE.md`, renvois à `backend/` dans ROADMAP, LLD, ARCHITECTURE et ENV_SETUP ; `docs/meta/dossier-revue-application.md` parle encore d'AdsFacile (dépôt public).


### S11 · Connexion Meta, Pages, kit de marque — ✅ 2026-10-15
- **PR** : #42 à #48 (fusionnées en squash, dernier commit b194cdf) ; #49 (retrait de clés réelles de `backend/.env.example`)
- **Fait** : routes `meta/connect` et `meta/callback` (`state` signé), connexions, bilan de santé (F1), Pages (limite de la formule, verrou de période), comptes publicitaires, kit de marque (F2), webhook Meta (vérification + événements de statut) ; écrans `/bienvenue/meta`, `/bienvenue/marque`, `/reglages/comptes-meta`, `/reglages/pages`, `/reglages/kit-de-marque` ; migrations 0006 (jetons scellés, un seul compte publicitaire actif par espace) et 0007 (webhook atomique).
- **Preuves** : 5 cas pour chacune des 13 opérations (29 opérations couvertes par `test:routes-coverage`) ; `test:int` 166 ; tests PGlite 25 + 7 ; tests de signature du webhook (TR-SEC-04 : absente, vide, mauvais secret, corps modifié, `sha1=` → 401 sans rien enregistrer ; rejeu traité une fois ; événement ancien mais bien signé accepté) ; couverture `core` 98,9 %, `web/features` 90,9 % ; 48 captures 390/1280 px sur la branche `captures/s11` ; « CI terminée » verte sur `main` (b194cdf) ; **connexion réelle** le 15/10/2026 sur `https://staging.pubeka.com` avec un compte Meta de test : bilan de santé affiché, 7 contrôles verts sur 8 (Instagram lié : facultatif, non lié), sélecteur de compte publicitaire fonctionnel. Captures de la connexion réelle **non versionnées** : elles montrent des noms et des identifiants de comptes (dépôt public).
- **Problèmes et cause** : (1) le contrôleur a trouvé deux défauts du webhook, corrigés avant la fusion : rejet à 5 minutes (Meta relivre jusqu'à 36 h, doc officielle) et événement perdu si l'écriture échouait après le marquage « déjà vu » (migration 0007). (2) Facturation GitHub Actions bloquée (« CI terminée » ne démarrait plus) : dépôt passé **public** par la personne, minutes illimitées. (3) La #48 a été fusionnée par mon script alors qu'un contrôle venait d'échouer : cause Docker Hub (`toomanyrequests`), vérifié ensuite par une CI verte sur `main`. Le script ne fusionne plus sans CI verte. (4) Vercel gratuit limite à 100 mises en ligne par jour : la mise en ligne de préproduction a été refusée une journée.
- **Décisions prises** : reconnexion = mise à jour de la connexion existante ; un seul compte publicitaire actif par espace ; la Page unique est activée d'office dans la limite de la formule ; déconnexion = jeton effacé, Pages désactivées, campagnes intactes chez Meta (la révocation côté Facebook n'est pas faite : l'écran dit de la retirer soi-même) ; webhook : seuls `in_process_ad_objects` et `with_issues_ad_objects` sont lus, ils alimentent `campaign_status_events` sans changer le statut (Meta fait foi, S17) ; limite de débit du webhook laissée à `none` (un 429 pourrait désactiver l'abonnement) ; logo non téléversable avant S14 ; guide « carte virtuelle » : Keecash cité sans lien. Configuration Meta : « Token d'accès utilisateur » (60 jours), pas « utilisateur système » (le code échange le code contre un jeton de longue durée avec `fb_exchange_token`). **Préproduction déplacée** sur `https://staging.pubeka.com` (enregistrement DNS A chez Hostinger, domaine ajouté au projet Vercel par la CLI, variable GitHub `STAGING_APP_HOST`, `NEXT_PUBLIC_APP_URL` en Preview) ; `PUBEKA_FAKE_PROVIDERS` = `saspay,media,ai,email` (Meta réel).
- **Sécurité** : clés Supabase (anon, service_role) et Gemini de l'ancien projet AdFacile retrouvées dans `backend/.env.example` (historique et `main`) : remplacées par des exemples (#49) ; ancien projet Supabase supprimé par la personne ; clé Gemini à supprimer chez Google AI Studio si ce n'est pas fait. Le dépôt étant public, ces valeurs restent lisibles dans l'historique : elles doivent rester révoquées.
- **Remarqué hors périmètre** : le sélecteur de Page de la coque (S09) affiche toujours « Aucune Page connectée » ; `rotateToken` non planifiée ; une seule connexion Meta par espace ; synchronisation des Pages et comptes seulement à la connexion et à « Revérifier » ; `quotas.pages_active` de GET workspace non calculé (S06) ; API_SPEC §12 règle 2 (« ±5 min ») ne s'applique pas à Meta, à ajuster ; taux FCFA/$ constant à 600 dans la fabrique du connecteur de connexion (S16 doit lire le vrai taux) ; `useEffect` qui lance le bilan au retour de Facebook (mutation, protégée par une ref) ; l'adresse Vercel `pubeka-staging.vercel.app` n'est plus mise à jour ; **à faire avant S36** : vrai widget Cloudflare Turnstile avec `app.pubeka.com` (la préproduction utilise la clé de test `1x0000…`), `release.yml`, réglage Supabase Auth de production ; webhook Meta à abonner (URL `https://staging.pubeka.com/api/v1/webhooks/meta`) ; limite Vercel gratuite de 100 mises en ligne par jour (les aperçus de PR la consomment).


### S10 · Portage du connecteur Meta — ✅ 2026-10-14
- **PR** : #34 à #39 (fusionnées en squash, dernier commit 6026c17)
- **Fait** : `packages/platforms` : connecteur Meta en TypeScript (client Graph, lectures du compte, ciblage, destinations, création et suivi de campagne, envoi des médias), erreurs Meta traduites en codes Pubeka, chiffrement des jetons (AES-256-GCM, rotation des clés), `FakeMetaConnector` et suite de contrat, connecteurs `google` et `tiktok` « indisponibles ».
- **Preuves** : 432 tests dans `@pubeka/platforms`, couverture 99,1 % des lignes et 91,9 % des branches ; 23 tests de chiffrement dont la rotation des clés ; la suite de contrat passe sur la fausse implémentation ; aucun appel réel à Meta ; « CI terminée » verte sur chaque PR ; revue de sécurité du chiffrement par le contrôleur : rien à signaler.
- **Problèmes et cause** : coupure par la limite de session, reprise de zéro sans perte. Le contrôle a trouvé quatre défauts, corrigés avant la fusion : jeton de Page et `interests: []` rétablis (comportement AdFacile) ; anti-SSRF des médias (liste d'hôtes obligatoire, redirections refusées, taille maximale, adresses privées refusées) ; `facebook.test.js` à porter ; taux de change devenu obligatoire.
- **Décisions prises** : `fetch` et `zod` à la place d'axios (interdit par ESLint) ; budgets en centimes de dollar ; contrôles de budget et de localisation **avant** le premier appel à Meta (aucun objet orphelin) ; messages « Pubeka » à la place d'« AdsFacile » ; `xafPerUsd` obligatoire (plus de 610 par défaut, `XAF_PER_USD` n'est plus lu) ; suite de contrat dans `packages/platforms` (pas dans `packages/testing`). **Décision produit** : l'IA propose les intérêts Meta de la campagne, l'utilisateur peut les modifier (S14 à S16).
- **Remarqué hors périmètre** : `core` devra fournir `allowedMediaHosts` (stockage Pubeka uniquement), `xafPerUsd`, lire `TOKEN_ENCRYPTION_KEYS` avec `parseEncryptionKeys`, enregistrer les identifiants de `createCampaign` et appeler `deleteCampaign` si l'enregistrement échoue ; un nom d'hôte autorisé dont le DNS pointerait vers une adresse interne n'est pas détecté (liste = domaines contrôlés par Pubeka) ; le jeton Meta reste dans l'URL des requêtes (comme AdFacile, jamais journalisé) ; structure de `ad_review_feedback` à confirmer en S18 ; ordre des types de résultat des statistiques à affiner en S17 ; validation de l'adresse de retour OAuth revient à S11 ; non portés : `oauthState`, `facebookAccount`, `uploadMedia`, `campaignDelete`, `campaignJobs*`, `facebookInsightsService`, `ttlCache`.


### S09 · Coque de l'application et première configuration — ✅ 2026-10-14
- **PR** : #29, #30, #31, #32 (fusionnées en squash, dernier commit 60dbe72)
- **Fait** : `next-intl` FR/EN et `i18n:check` (208 clés) ; coque (barre latérale, onglets en bas sur téléphone, bandeau, carte utilisateur, sélecteur de Page) ; TanStack Query, `nuqs`, magasin Zustand ; `/bienvenue/{etape}` ; `/reglages/profil`, `/reglages/equipe`, `/reglages/notifications` ; habillage final des écrans de S04.
- **Preuves** : parcours P1 au vert (`e2e:ci`, 74/74, aussi en conditions CI) ; bascule de langue sans texte en dur (TR-PLT-03) ; 66 captures à 360, 390, 768 et 1280 px, clair et sombre, sans défilement horizontal, axe sans violation (branche `captures/s09`) ; `test:int` 89/89 ; « CI terminée » verte sur chaque PR.
- **Problèmes et cause** : coupure réseau du sous-agent, repris. `AGENTS.md` et `CLAUDE.md` générés par Next avaient été commités : retirés et ignorés dans `.gitignore`. Prettier avait reformaté par erreur des tests de S05/S06 dans #31 : restaurés dans #32.
- **Décisions prises** : le loader court garde son Lime foncé (décision de la personne, 14/10/2026). Hors chemins de §5 mais exigés par la fiche : route `GET/PUT /notifications/preferences` (rattachée à S27, 12 types de notification à confirmer en S27) ; recalcul du fuseau au changement de pays (`core/account/me.ts`) ; `turbo.json`, `pnpm-workspace.yaml`, parcours dans `apps/web/e2e/journeys`.
- **Remarqué hors périmètre** : `OpeningLoader` de `packages/ui` reste affiché en développement (effets exécutés deux fois) : la coque le contourne, à corriger dans `packages/ui` ; pas d'écran `/invitation`, ni de liste ou annulation des invitations en attente, ni de transfert de propriété ; impossible d'effacer le numéro de téléphone (`MeUpdate` refuse `null`) ; `detail` traduit de `problem.ts` non fait ; étapes « essai » dépendantes de S24 ; ENV_SETUP §4 à compléter avec 8 dépendances (next-intl 4.14.7, @tanstack/react-query 5.104.0, nuqs 2.10.1, zustand 5.0.15, react-hook-form 7.89.0, @hookform/resolvers 5.9.1, tailwindcss et @tailwindcss/postcss 4.3.3, @axe-core/playwright 4.13.0).


### S08 · Design system en composants — ✅ 2026-10-14
- **PR** : #27 (fusionnée en squash, commit 85ba53b)
- **Fait** : `packages/ui` : jetons (DESIGN-SYSTEM §9, clair et sombre par `data-theme`, exportés en `@pubeka/ui/styles.css`) ; composants shadcn habillés (Button, Field, Switch, Card, Eyebrow, Dialog) ; Montant, Badge de statut (6 statuts), Carte de modèle ; loader « Saisie » (complet une fois par session, court au-delà de 300 ms) ; page de démonstration (`pnpm --filter @pubeka/ui demo`, port 5180).
- **Preuves** : 14 tests Vitest et 14 tests Playwright ; axe à 0 violation en clair et sombre, à 390 et 1280 px, modale ouverte comprise ; pas de défilement horizontal ; « réduire les animations » testé ; 4 captures dans `packages/ui/e2e/captures/` ; « CI terminée » verte sur c91cafd (exécution 38543587161).
- **Problèmes et cause** : première CI rouge à cause de la limite de téléchargement de Docker Hub (tâche relancée sans changement). Le tracé « ubeka » de `docs/design/loader/` a perdu ses espaces : le composant reprend celui de `docs/design/logo/pubeka-logo-sombre.svg`. Entrée de journal écrite par erreur dans la PR, retirée après contrôle.
- **Décisions prises** : démonstration dans `packages/ui` (Vite, port 5180, l'application reste sur 5173), lancée par `pnpm e2e:ci` ; `export default` admis dans les fichiers de configuration de Playwright, Vite et Vitest (imposé par ces outils) ; CSS du loader dans `@layer components` ; avec « réduire les animations », logo fixe 800 ms ; nouvelles dépendances `vite` 8.3.1, `@vitejs/plugin-react` 6.1.1, `@tailwindcss/vite` 4.3.3.
- **Remarqué hors périmètre** : tracé cassé et couleurs en dur dans `docs/design/loader/` ; loader court Lime foncé sur fond clair à environ 2,3:1 de contraste (**à trancher par la personne**) ; Prettier a mis les codes hexadécimaux des jetons en minuscules (mêmes couleurs) ; ENV_SETUP §4 ne liste pas les trois nouvelles dépendances ; avertissements `pnpm peers` déjà présents ; échec « Vercel – adsfacile » tant que l'ancien projet est branché (👤).


### S07 · Préproduction en ligne — ✅ 2026-10-13
- **PR** : #24 (fusionnée en squash, commit c68f567)
- **Fait** : chaque fusion dans `main` est mise en ligne en préproduction, automatiquement :
  - migrations appliquées sur `pubeka-dev` ;
  - étape Trigger.dev sautée tant que `jobs/` n'existe pas ;
  - construction Vercel ;
  - deux adresses fixes : `pubeka-staging.vercel.app` (application) et `pubeka-staging-site.vercel.app` (site) ;
  - tests de fumée. `apps/web/vercel.json` coupe la mise en ligne automatique de `main` par Vercel.
- **Preuves** :
  - déploiement manuel 38438206070 : tout est vert, 6/6 tests de fumée, migration `0005` présente sur `pubeka-dev` ;
  - déploiement **déclenché par la fusion** 38439376305 (`workflow_run` sur c68f567) : 6/6 ;
  - « CI terminée » verte.
- **Problèmes et cause** (toutes les solutions viennent de la documentation officielle ; règle ajoutée par #25) :
  - jeton Supabase : format, puis permissions. `link` a besoin de Project Settings, API Keys, API Key Secrets et Data API Config en lecture, plus Connection Pooling pour passer en IPv4, car les runners GitHub n'ont pas d'IPv6 ;
  - une panne 502 passagère de Supabase ;
  - `VERCEL_TOKEN` : collé avec un retour à la ligne, puis enregistré vide, puis limité au projet au lieu de l'équipe ;
  - `.vercelignore` d'AdFacile qui excluait `apps/web/.env.example` ;
  - secret de contournement erroné ;
  - `ADMIN_PATH` : la commande donnée par le chef de projet produisait `-` et `_`, refusés par `env.ts` ;
  - `TOKEN_ENCRYPTION_KEYS` et `TOKEN_ENCRYPTION_ACTIVE_KEY_ID` abîmées au collage ; corrigées avec `vercel env update` en lisant l'entrée standard ;
  - test de la racine qui lisait la redirection 307 de Vercel (cookie de contournement) au lieu de notre 308.
- **Décisions prises** :
  - D-6 : adresses Vercel, pas de domaine ;
  - Trigger.dev en offre gratuite : un 2ᵉ projet `pubeka-staging`, dont l'environnement prod sert de préproduction ; `proj_wnjyspfoeknisnyzygkj` est réservé à la production ;
  - nouveau projet Vercel `pubeka` (l'ancien `adsfacile` est à débrancher) ;
  - secrets au niveau du dépôt GitHub ;
  - `PUBEKA_PIPELINE_ENABLED=true` activée par le chef de projet.
- **Remarqué hors périmètre** :
  - `release.yml` : `trigger.dev deploy` sans `--project-ref`, `--token` passé à Vercel, secrets de production à séparer avant S36 ;
  - `e2e:ci` et `e2e:smoke:prod` n'existent dans aucun paquet : la tâche « Parcours critiques » est verte sans rien tester tant que P1 n'existe pas ;
  - `actionlint` n'est pas lancé en CI ;
  - les identifiants Google et Apple restent en attente (👤).


### S06 · Espaces de travail et équipe — ✅ 2026-10-13
- **PR** : #20 (espaces, membres, transfert) et #21 (invitations, e-mail d'invitation), fusionnées en squash. Le sous-agent a coupé la session lui-même (ROADMAP §1.2).
- **Fait** : cas d'usage `core/workspaces` ; routes `/workspaces`, `members`, `invitations`, `invitations/accept` et `transfer-ownership` ; e-mail d'invitation en texte simple, FR et EN, par un faux fournisseur ou par Resend.
- **Preuves** : `test:routes-coverage` couvre 14 opérations, dont les 9 de S06 ; EC-TEAM-01 à 06 en intégration et 07 en test unitaire ; limite de membres par formule testée (Starter, Pro, Business) ; `test:int` 82/82 ; `packages/core` couvert à 100 % des lignes ; « CI terminée » verte sur #20 et #21.
- **Problèmes et cause** : un test de `listMembers` échouait au hasard, parce que deux membres avaient la même date d'arrivée ; un second tri par identifiant a été ajouté. Après la fusion en squash de #20, la PR empilée #21 a eu des conflits ; ils ont été résolus en gardant sa version, qui contient déjà #20, et son diff est resté identique.
- **Décisions prises** :
  - Le propriétaire compte dans la limite de membres (plans-et-credits : Starter = 1). Un espace sans abonnement suit les limites de Starter.
  - EC-TEAM-07 répond 402 `member_limit_reached`, selon la liste fermée d'API_SPEC §4 ; SECURITY_NOTES dit 409 et est à harmoniser.
  - Le transfert de propriété exige une connexion de moins de 5 minutes et est refusé en lecture seule.
  - Invitation valable 7 jours ; les invitations en attente comptent dans la limite ; le jeton est dans le fragment du lien et n'est jamais journalisé.
- **Remarqué hors périmètre** : aucun écran `/invitation` n'est prévu (à ajouter en S09 ou S27) ; dans `turbo.json`, `openapi:lint` et `api:types` ne surveillent pas `api/openapi.yaml` (cache périmé) ; pas de dépôts `db` pour les membres et les invitations ; aucune route pour lister ou annuler les invitations ; pas de purge des invitations expirées ; pas d'état `grace` pour les espaces avant S19.


### S05 · Couche HTTP commune — ✅ 2026-10-13
- **PR** : #16, #17, #18 (fusionnées en squash). La PR d'origine #15 est fermée : 48 fichiers et environ 3 800 lignes dépassaient les plafonds de ROADMAP §1.2. Elle a été coupée en trois parties successives par le chef de projet (§8.5), sans changer le code.
- **Fait** : `server/http` (`api()`, `problem()`, contrôle d'`Origin`, limites de débit, idempotence, SSE) ; `packages/testing` (horloge, fabriques, `seedWorkspace`, `seedAdmin`, `describeRoute`) ; `Ctx` et premiers cas d'usage de `core` ; scripts `ci:env`, `test:int`, `test:routes-coverage` ; routes `/public/*` et `/me`.
- **Preuves** : 45 tests unitaires de `api()` ; `pnpm test:int` 26/26 sur la base locale ; `test:routes-coverage` couvre les 5 opérations codées ; couverture de `server/http` 99,6 % des lignes ; « CI terminée » verte sur les trois PR.
- **Problèmes et cause** : sous-agent coupé une fois par la limite d'utilisation, puis repris. Le premier contrôle d'`Origin` répondait 403 au lieu de 401 sans authentification ; le test d'intégration l'a détecté. Zod 4 ne renvoie pas la valeur reçue dans ses erreurs, d'où une relecture de l'entrée. Dans la partie 2, `test:int` a été retiré tant qu'aucun fichier d'intégration n'existait (vitest échoue sans fichier).
- **Décisions prises** : le contrôle d'`Origin` ne s'applique qu'aux écritures avec cookie ; limites de débit par utilisateur, par IP pour `/public/*` et par espace pour la génération et l'IA ; corps de plus de 1 Mo → 413 ; accès `admin` en 404 jusqu'à S30 ; `DELETE /me` et l'export en S34. Hors chemins mais exigé : `packages/core` (dont `core/account`, de S34) et les réponses 403, 413, 429 et 503 dans `openapi.yaml`.
- **Remarqué hors périmètre** : `proxy.ts` ne rafraîchit pas la session pour `/api` ; règle de salutation en double (`features/auth` et `core/account`) ; `private.rate_limits` sans purge planifiée.


### S04 · Connexion et inscription — ✅ 2026-10-12
- **PR** : #13 (fusionnée en squash, commit eee4cd0)
- **Fait** : écrans `/inscription`, `/connexion`, `/mot-de-passe-oublie` (sans habillage final) ; session `@supabase/ssr` dans `proxy.ts` ; e-mail, lien magique, Google et Apple via Supabase Auth ; CAPTCHA Turnstile ; blocage 15 min après 5 échecs par couple e-mail + IP (migration 0004) ; déconnexion après 10 min d'inactivité avec alerte ; salutation selon le fuseau.
- **Preuves** : 102 tests web et 14 tests PGlite (EC-AUTH-01 à 06) ; couverture de `server/` 99 % des lignes ; blocage vérifié sur la pile locale (401 ×4 puis 429, une autre IP passe, une autre origine reçoit 403, « mot de passe oublié » répond dans le même délai pour un e-mail connu ou inconnu) ; inscription réelle par e-mail jusqu'à l'accueil ; 32 captures 390/1280 px, clair et sombre (branche `captures/s04`) ; « CI terminée » verte sur 9eaad7d.
- **Problèmes et cause** : une première règle de blocage en fenêtre glissante débloquait à la 14ᵉ minute ; le test PGlite l'a détecté. La fenêtre d'inactivité était décalée à 390 px par la mise en page par défaut de `<dialog>`.
- **Décisions prises** :
  - Migration 0004 : `private.login_failures` stocke seulement une empreinte SHA-256 de l'e-mail et de l'IP.
  - Le CAPTCHA est demandé à chaque connexion (Supabase l'exige une fois activé).
  - « E-mail déjà utilisé » s'affiche à l'inscription, comme le prévoit APPFLOW §4. Cela révèle qu'un compte existe : **à revoir par la personne** si elle préfère un message neutre.
  - Le lien magique ne crée pas de compte. Salutation « Bonsoir » de 18 h à 3 h 59. Actions `/auth/*` hors de `/api/v1`. Textes dans `features/auth/messages.ts` jusqu'à S09.
- **Action 👤 en attente** : créer les identifiants Google et Apple et les mettre dans `supabase/.env` (marche à suivre dans la PR #13), avant S07.
- **Remarqué hors périmètre** : un nouveau mot de passe identique à l'ancien (`same_password`) affiche un message générique ; `private.login_failures` n'a pas de purge planifiée ; pas de `.env.example` à la racine ; la clé de test Turnstile accepte un faux jeton (le refus est prouvé par des tests unitaires).


### S03 · Base de données : migration 0003 et module `db` — ✅ 2026-10-12
- **PR** : #11 (fusionnée en squash, commit 1cc2bcf)
- **Fait** : migration `0003_api_support.sql` (E1 à E4, E7 à E10) ; `seed.sql` (pays de la zone franc CFA) ; `packages/db` (clients utilisateur et service, types générés, crédits, limites de débit, webhooks, dépôts) ; `DATA_MODEL.md` regénéré (57 tables).
- **Preuves** : `pnpm test:db` donne 44/44 pour les tests existants et 53/53 pour la 0003 ; `supabase db reset` passe en local ; une inscription réelle crée profil, espace, membre `owner` et code de parrainage, sans abonnement ni crédit ; `pnpm db:types` ne produit aucune différence ; `packages/db` couvert à 100 % des lignes ; « CI terminée » verte sur 755a8fd.
- **Problèmes et cause** : arrêt de la session sur la contradiction E10 (LLD contre APPFLOW), tranchée par la personne (#10). Docker Desktop plantait au démarrage à cause d'anciens fichiers de socket dans `%LOCALAPPDATA%/Docker/run` et `docker-secrets-engine`. Le sous-agent a **renommé** ces dossiers en `*.old-*` sans rien supprimer ; ils sont à effacer à la main. `gen-data-model.mjs` recevait un chemin relatif : ajout de `resolve()`.
- **Décisions prises** :
  - E4 : une seule libération par génération ; les crédits sont rendus d'abord dans le compartiment acheté, puis bonus, puis mensuel, dans la limite de ce qui a été réservé dans chacun. La réservation suit l'ordre inverse (0001). Les crédits mensuels sont rendus en bonus quand le dernier `period_end` est passé (EC-CRED-12).
  - E8 : chaque transfert de propriété est journalisé dans `audit.workspace_log`, en ajout seul.
  - Fonctions `public.*` réservées à `service_role`, pour appeler les fonctions de `private` par `rpc()`.
  - `seed.sql` ne contient ni TVA ni taux de change, pour ne rien inventer.
  - Hors des chemins de S03 mais exigé : script `db:types` dans le `package.json` racine.
- **Remarqué hors périmètre** : `config.toml` a `site_url` sur le port 3000 (à corriger en S04) ; SECURITE-BACKEND cite encore `db/` ; `packages/db` n'importe pas `server-only`, car le module sert aussi à `jobs`, et un garde-fou à l'exécution le remplace.


### S02 · Briques partagées et contrat — ✅ 2026-10-12
- **PR** : #8 (fusionnée en squash, commit 05a3368)
- **Fait** : `packages/shared` (`env.ts` validé par Zod avec les 4 règles d'ENV_SETUP §1.12, `Money` en entiers sans flottant, dates, identifiants, `logger` avec masquage, `assertNever`) ; `packages/contracts` (types générés depuis `openapi.yaml`, `ErrorCode`, `ERROR_STATUS`, `AppError`) ; scripts `api:types`, `openapi:lint`, `test:coverage`.
- **Preuves** : test qui compare `ErrorCode` à l'énumération d'OpenAPI (36 codes) ; tests d'`env.ts` qui refusent `sk_test_` et `PUBEKA_FAKE_PROVIDERS` en production ; couverture de `shared` 98,63 % des lignes (seuil 80 %), `contracts` 100 % ; « CI terminée » verte sur 8e8aacd.
- **Problèmes et cause** : sous-agent coupé une fois par une erreur d'accès à l'API, puis repris avec son contexte. TypeScript 6 n'inclut plus les types de Node d'office : ajout de `"types": ["node"]`.
- **Décisions prises** : `Money` = `{ amountMinor, currency }` ; une variable vide compte comme absente ; `PUBEKA_JOB_DISPATCH` vaut `trigger` par défaut et `inline` est refusé en production ; liste fermée des variables `NEXT_PUBLIC_` ; clé de traduction d'`AppError` en simple chaîne (`contracts` n'importe pas `i18n`). Hors des chemins de S02 mais exigés par la fiche : tâche `api:types` dans `package.json` racine et `turbo.json`.
- **Correction après fusion** (cette PR, `fix/prettier-sources`) : `.prettierignore` (S01) contenait `src/`, ce qui excluait `packages/*/src` de Prettier. Exclusions ancrées à la racine (`/src/`…), fichier généré `src/generated/` exclu, `env.ts` et `logger.ts` formatés.
- **Remarqué hors périmètre** : `coverage:summary` lance encore `scripts/noop.mjs` ; ajouter `yaml` 2.9.1 (dépendance de test) à ENV_SETUP §4.3.


<!-- Modèle d'une entrée :
### SNN · <titre> — ✅ AAAA-MM-JJ
- **PR** : #NN (fusionnée en squash, commit abcdef0)
- **Fait** : 2 à 4 lignes, ce qui marche maintenant
- **Preuves** : commandes et résultats, tests, captures (liens vers la PR)
- **Décisions prises** : … (ou « aucune »)
- **Remarqué hors périmètre** : … (ou « rien »)
-->

### S01 · Squelette du monodépôt — ✅ 2026-10-12
- **PR** : #5 (fusionnée en squash, commit 79850f0)
- **Fait** : monodépôt pnpm 12.7.0 + Turborepo 2.11.4 ; `packages/config` (tsconfig, ESLint, Prettier) ; 13 paquets vides et `jobs` ; `apps/web` en Next 16.3.6 sur le port 5173 avec `proxy.ts` (site / console / admin) et deux pages vides ; `db/` déplacé dans `supabase/` avec un `config.toml` par défaut.
- **Preuves** : `pnpm install --frozen-lockfile`, `format:check`, `lint`, `typecheck`, `test`, `build` OK ; `test:db` 44/44 ; aiguillage vérifié par curl (`/` → 308 `/fr`, `/console` `/site` `/admin` → 404 sur les deux domaines) ; captures 390 et 1280 px ; « CI terminée » verte (exécution 38271674174).
- **Problème et cause** : « Recherche de secrets » rouge parce que gitleaks n'avait pas le droit `pull-requests: read` (« Resource not accessible by integration »). Corrigé dans `main` par #6 ; `main` fusionnée dans la branche, puis CI verte.
- **Décisions prises** (avec la personne) : base `main` ; config racine de l'ancien front remplacée (`src/`, `backend/` gardés en référence) ; `supabase/config.toml` par défaut dès S01. `eslint-plugin-boundaries` remplacé par `no-restricted-imports`, parce que le plugin ne détectait pas les imports interdits (vérifié) ; `settings.react.version` écrite, car `eslint-plugin-react` plante sous ESLint 10.
- **Remarqué hors périmètre** : références à `db/…` dans `docs/` ; en-tête « État du dépôt » de CLAUDE.md périmé ; `bench/` sans `package.json` ; ancien `scripts/` à retirer en S12 ; vérification Vercel en échec (projet Vercel pas encore configuré pour le monodépôt, S07).

