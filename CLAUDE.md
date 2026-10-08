# Adfacile — instructions projet

## Règle n°1 : charger la skill AVANT de coder

Les skills sont l'aide au code de ce projet. **Identifier le domaine de la tâche,
appeler l'outil `Skill` correspondant, puis seulement écrire du code.** Jamais
l'inverse : pas de code d'abord, skill après.

Cela vaut aussi pour les « petites » modifications (un bouton, une marge, une
requête) — c'est justement là qu'on dérive des conventions du projet.

### Table de correspondance domaine → skill

| Domaine de la tâche | Skill à appeler d'abord |
| --- | --- |
| UI / UX, nouvel écran, composant visuel, mise en page | `frontend-design`, puis `typography` |
| Composants shadcn / registres / `components.json` | `shadcn` (skill locale, `.claude/skills/shadcn`) |
| Design system, tokens, thèmes | `design-system-patterns` |
| Micro-interactions, transitions, états de chargement | `interaction-design` |
| Animations (GSAP, motion) | `gsap-core`, `improve-animations` |
| Responsive, mobile | `responsive-design` |
| Accessibilité, WCAG, ARIA | `accessibility-compliance` puis `accesslint-audit` |
| React : perf, hooks, state, composition | `react-best-practices`, `composition-patterns`, `react-state-management` |
| API backend (REST, contrats, erreurs) | `api-design-principles`, `error-handling-patterns` |
| Base de données, SQL, migrations | `postgresql`, `sql-optimization-patterns`, `database-migration` |
| Tests unitaires JS | `unit-tests` (locale), `javascript-testing-patterns` |
| Tests E2E | `e2e-testing-patterns` |
| Débogage d'un bug | `debugging-strategies` |
| Revue de code, PR | `code-review-excellence`, `pr-open` (locale) |
| Git avancé, rebase, historique | `git-advanced-workflows` |
| CI/CD, déploiement | `deployment-pipeline-design`, `github-actions-templates` |
| SEO / contenu | skills `seo-*` |
| Décision d'architecture à documenter | `architecture-decision-records` |

Si aucune ligne ne correspond exactement, appeler `find-skills` pour chercher la
skill adéquate avant de commencer.

### Procédure

1. Lire la demande, nommer le domaine.
2. `Skill(<nom>)` — une ou plusieurs si la tâche est mixte (ex. écran React
   accessible → `frontend-design` + `accessibility-compliance`).
3. Suivre les consignes de la skill.
4. Coder.
5. Vérifier dans le navigateur (voir plus bas) avant d'annoncer que c'est fait.

## Interdit : toucher aux palettes de couleurs

Les couleurs du produit sont figées. **Ne jamais modifier, remplacer, « harmoniser »
ou « moderniser » une palette**, y compris quand une skill de design propose une
direction chromatique différente : dans ce cas on garde la palette du projet et on
n'applique que le reste (espacement, hiérarchie, typographie, états).

Concrètement :

- Ne pas changer les valeurs de `src/styles/variables.css` (`--color-*`).
- Ne pas introduire de nouvelle couleur en dur ; réutiliser une variable existante.
- Ne pas modifier les couleurs Tailwind (`src/styles/tailwind*.css`) ni les thèmes.
- Si un besoin de couleur nouvelle apparaît réellement : le signaler à l'utilisateur
  et attendre sa décision, ne pas l'ajouter d'office.

Le seul cas où une couleur bouge, c'est une demande explicite de l'utilisateur
portant sur cette couleur précise.

## Contexte technique

- Front : React + Vite, CSS classique dans `src/styles/` + Tailwind sur certains écrans.
- Back : Node/Express dans `backend/src/` (contrôleurs, routes, services Facebook Ads).
- Serveur de dev : **http://localhost:5173** (Vite). Jamais le port 80.
- Lancer le serveur via l'outil de prévisualisation, pas via Bash.

## Vérification

Après une modification visible dans le navigateur : ouvrir la prévisualisation,
recharger, lire la console et la page, et fournir une capture ou un extrait de
console comme preuve. Ne pas demander à l'utilisateur de vérifier à la main.
