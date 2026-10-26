# TRD — Exigences techniques Pubeka

> Version 1 · 10 octobre 2026 · Statut : à valider.
> Le **PRD** dit *ce que fait* Pubeka. Ce **TRD** dit *ce que le système doit garantir techniquement*, de façon **vérifiable**. L'**architecture** dit *comment* on le construit.
> Documents liés : [PRD](PRD.md) · [Plans et crédits](plans-et-credits.md) · [Architecture](../architecture/ARCHITECTURE.md) · [Modèle de données](../architecture/DATA_MODEL.md) · [Agents](../agents/README.md) · [Design system](../design/DESIGN-SYSTEM.md).

**Lecture des exigences**
- Identifiant `TR-<domaine>-<n°>`, priorité **MVP** (obligatoire au lancement) ou **V2/V3**.
- « Vérification » = comment on prouve que l'exigence est tenue (test automatique, test manuel, mesure, revue).
- 🔶 = cible proposée par Claude, **à confirmer** (aucune décision explicite prise en atelier).

---

## 1. Périmètre

| Inclus au MVP | Hors MVP |
|---|---|
| Site public FR/EN, application web responsive, administration | Application mobile native (V3) |
| Création et publication de campagnes **Meta** | Google Ads, TikTok Ads (« Bientôt disponible ») |
| Agents IA (Analyste, Stratège, Designer, Modérateur, Optimiseur, Aide) | Agent Vidéaste (V2) |
| Images IA (fal + Higgsfield) | Vidéo IA : Wan 3.0, Seedance 2.5 (V2, après les tests images) |
| Abonnements et crédits payés via SasPay | Prélèvement automatique (non proposé par SasPay) |

---

## 2. Plateforme et compatibilité

| ID | Exigence | Priorité | Vérification |
|---|---|---|---|
| TR-PLT-01 | L'application fonctionne de bout en bout **sur téléphone** à partir de **360 px** de large, sans défilement horizontal, avec une gouttière de 16 px | MVP | Test manuel 360 / 390 / 768 / 1280 px |
| TR-PLT-02 | Navigateurs : Chrome Android, Safari iOS, Chrome, Edge, Firefox, Safari bureau — **2 dernières versions** 🔶 | MVP | Test manuel |
| TR-PLT-03 | Interface en **français et anglais**, choisie par l'utilisateur ; aucun texte d'interface codé en dur | MVP | Revue + test de bascule de langue |
| TR-PLT-04 | Dates et heures affichées dans le **fuseau du lieu déclaré à l'inscription** ; salutation « Bonjour » / « Bonsoir » selon l'heure locale | MVP | Test unitaire |
| TR-PLT-05 | Montants affichés **en FCFA (XAF ou XOF), dollars en petit dessous**, chiffres tabulaires, séparateur de milliers « espace fine » | MVP | Revue visuelle |
| TR-PLT-06 | Thème **clair par défaut**, thème sombre disponible | MVP | Test manuel |
| TR-PLT-08 | **Hors connexion** : bandeau ; saisies gardées sur l'appareil et envoyées au retour du réseau ; publier, payer et générer désactivés hors connexion | MVP | Test manuel (mode avion) |
| TR-PLT-07 | Une API interne propre (routes versionnées) réutilisable par la future application mobile | MVP | Revue d'architecture |

---

## 3. Performance

| ID | Exigence | Priorité | Vérification |
|---|---|---|---|
| TR-PRF-01 | Pages publiques : **LCP < 2,5 s, INP < 200 ms, CLS < 0,1** sur téléphone milieu de gamme en 4G 🔶 | MVP | Lighthouse mobile + données réelles PostHog |
| TR-PRF-02 | Application : écran du tableau de bord interactif en **< 3 s** en 4G 🔶 | MVP | Mesure |
| TR-PRF-03 | API interne (hors IA et fournisseurs) : **p95 < 500 ms** 🔶 | MVP | Mesure Sentry |
| TR-PRF-04 | Le **loader** complet (3 s) ne s'affiche **qu'une fois par session** ; entre deux pages, la version courte n'apparaît **que si le chargement dépasse 300 ms** | MVP | Test manuel |
| TR-PRF-05 | La proposition de campagne du Stratège s'affiche **progressivement** (premiers mots en < 3 s 🔶) | MVP | Mesure |
| TR-PRF-06 | Chaque visuel s'affiche **dès qu'il est prêt**, sans attendre les autres | MVP | Test manuel |
| TR-PRF-07 | Position dans la file et temps estimé affichés pendant toute génération | MVP | Test manuel |
| TR-PRF-08 | GSAP et Lenis chargés **uniquement** sur les pages publiques | MVP | Analyse des bundles |
| TR-PRF-09 | Toute animation respecte « réduire les animations » du système | MVP | Test manuel |

---

## 4. Disponibilité, sauvegardes, reprise

| ID | Exigence | Priorité | Vérification |
|---|---|---|---|
| TR-DSP-01 | Disponibilité mensuelle de l'application **≥ 99,5 %** hors maintenance annoncée 🔶 | MVP | Page de statut |
| TR-DSP-02 | Production sur Supabase **Pro** dès le paiement de l'offre : **sauvegardes quotidiennes** ; perte de données maximale 24 h (RPO) ; remise en service < 4 h (RTO) 🔶 | MVP (à l'activation Pro) | Test de restauration trimestriel |
| TR-DSP-03 | **Mode maintenance** activable depuis l'administration, sans redéploiement, avec message (« Retour à 14 h ») | MVP | Test manuel |
| TR-DSP-04 | Panne d'un fournisseur d'IA média : **bascule proposée** vers un modèle testé équivalent ; aucune perte de crédits | MVP | Test de panne simulée |
| TR-DSP-05 | Page de statut publique `status.pubeka.com` | MVP | Revue |
| TR-DSP-06 | Deux environnements isolés (**développement**, **production**), deux projets Supabase distincts | MVP | Revue |

---

## 5. Sécurité

| ID | Exigence | Priorité | Vérification |
|---|---|---|---|
| TR-SEC-01 | **RLS activée sur 100 % des tables** ; un utilisateur ne peut lire ni écrire les données d'un autre espace | MVP | Tests automatiques d'accès croisé |
| TR-SEC-02 | Jetons Meta et secrets TOTP **chiffrés AES-256-GCM** au repos ; clé hors base et hors code ; rotation possible (`key_version`) | MVP | Revue + test |
| TR-SEC-03 | Aucune clé secrète (Meta, SasPay, IA, fournisseurs) dans le code, le navigateur ou les journaux | MVP | Analyse automatique des secrets en CI |
| TR-SEC-04 | **Signature vérifiée** de tous les webhooks (SasPay, Meta, fal, Higgsfield, Resend) ; événement rejoué ignoré | MVP | Tests automatiques |
| TR-SEC-05 | **Clé d'idempotence obligatoire** sur tout paiement SasPay ; montants recalculés côté serveur | MVP | Tests automatiques |
| TR-SEC-06 | Administration : **404** pour tout non-administrateur, **double vérification** (TOTP) obligatoire, **blocage après 5 essais**, journal de chaque action | MVP | Tests automatiques + test d'intrusion manuel |
| TR-SEC-07 | Contenu des sources (sites, PDF, images) traité comme **donnée** ; tentative d'injection signalée (`PROMPT_INJECTION_SUSPECTED`) | MVP | Banc de test (cas pièges) |
| TR-SEC-08 | Fichiers envoyés : types contrôlés ; **10 Mo** par image, **20 Mo** par PDF, **10 références** max par génération ; fichiers servis par URL signée temporaire | MVP | Tests automatiques |
| TR-SEC-09 | Limites de requêtes par compte et **plafond quotidien de générations** (valeur à fixer après mesure des coûts) | MVP | Tests automatiques |
| TR-SEC-10 | En-têtes CSP, HSTS ; cookies `Secure`, `HttpOnly`, `SameSite` | MVP | Analyse automatique |
| TR-SEC-11 | Procédure écrite de **rotation de toutes les clés** en cas de fuite | MVP | Revue |
| TR-SEC-13 | **Déconnexion après 10 minutes d'inactivité**, avertissement 60 s avant avec **[Rester connecté]** ; brouillons enregistrés ; tâches serveur (génération, publication) non interrompues | MVP | Test automatique |
| TR-SEC-14 | Connexion bloquée **15 minutes** après 5 échecs ; lien de réinitialisation valable 1 heure | MVP | Test automatique |
| TR-SEC-12 | Connexion : Google, Apple, e-mail ; **pas de connexion Facebook pour le compte Pubeka** | MVP | Revue |

---

## 6. Données et confidentialité

| ID | Exigence | Priorité | Vérification |
|---|---|---|---|
| TR-DON-01 | Données hébergées en **Irlande** (Supabase `eu-west-1`) | MVP | Revue |
| TR-DON-02 | Fichiers des visuels **non utilisés supprimés après 7 jours**, avec avertissement préalable ; fichiers des visuels utilisés en campagne conservés tant que la campagne existe | MVP | Test de la tâche de suppression |
| TR-DON-03 | Description des visuels (`VisualSpec`) et propositions de campagne **conservées** (références « similaire à ») | MVP | Revue |
| TR-DON-04 | Fichiers générés **copiés dans notre stockage dès la fin de la génération** (BytePlus ne les garde que 24 h ; URL fal publiques par défaut) | MVP | Test automatique |
| TR-DON-05 | **Suppression de compte** : effacement de toutes les données Pubeka ; campagnes conservées chez Meta ; données de facturation conservées (obligation légale) | MVP | Test manuel |
| TR-DON-06 | **URL de suppression des données** et politique de confidentialité publiques (exigées par Meta) ; textes relus par un juriste avant lancement | MVP | Revue |
| TR-DON-07 | Registre des crédits et journal d'administration **en ajout seul** (aucune modification ni suppression possible) | MVP | Test : une mise à jour est refusée par la base |
| TR-DON-08 | Revisionnage de sessions PostHog : **champs sensibles masqués** (téléphone, jetons, paiement) | MVP | Revue |
| TR-DON-09 | Aucune donnée d'un client envoyée à un agent traitant un autre client | MVP | Revue + tests |

---

## 7. Plateformes publicitaires

| ID | Exigence | Priorité | Vérification |
|---|---|---|---|
| TR-PLA-01 | Interface **commune** de connecteur (connecter, lister comptes et Pages, créer, modifier, pause, reprise, statut, statistiques, motif de refus) | MVP | Revue |
| TR-PLA-02 | Le code Meta existant (création de campagnes, erreurs, ciblage) est **porté en TypeScript avec ses tests**, qui passent **avant** toute modification | MVP | CI |
| TR-PLA-03 | Production : connexion Meta par **utilisateur système** du Business Manager ; jetons classiques acceptés avec **alerte 7 jours avant expiration** | MVP | Test |
| TR-PLA-04 | **Bilan de santé** à la connexion : portefeuille business, compte publicitaire, moyen de paiement, Page, Instagram, WhatsApp, pixel | MVP | Test manuel |
| TR-PLA-05 | Statuts des pubs synchronisés (webhooks + vérification toutes les 15 min) | MVP | Test |
| TR-PLA-06 | Statistiques copiées **toutes les heures** + bouton « Actualiser » ; écran mis à jour **sans rechargement** | MVP | Test |
| TR-PLA-07 | **Alerte e-mail** avant l'arrêt d'une version de l'API Meta utilisée | MVP | Test de la tâche |
| TR-PLA-08 | Limite de Pages par formule (1 / 3 / 10) ; formule 1 Page : Page figée pour la période dès la première campagne | MVP | Tests automatiques |
| TR-PLA-09 | Quota de campagnes décompté **au clic sur Publier** ; republication après refus non décomptée | MVP | Tests automatiques |
| TR-PLA-10 | Budget quotidien **≥ 1 $** imposé | MVP | Test |
| TR-PLA-11 | Connecteurs Google Ads et TikTok Ads | V2 | — |

---

## 8. Agents IA

| ID | Exigence | Priorité | Vérification |
|---|---|---|---|
| TR-AGT-01 | Sortie de chaque agent **validée par schéma** ; 1 nouvel essai avec l'erreur, puis échec visible | MVP | Tests automatiques |
| TR-AGT-02 | Chaque appel journalisé : agent, modèle, version du prompt, jetons, coût, durée, validité | MVP | Revue |
| TR-AGT-03 | Appels **côté serveur uniquement**, via la passerelle IA | MVP | Revue |
| TR-AGT-04 | Tout changement de prompt crée une version et doit **repasser le banc de test** | MVP | CI |
| TR-AGT-05 | Seuils du banc de test (spécifications des agents) : Analyste 0 invention, 100 % schéma, 3 à 5 questions ; Stratège 100 % schéma, ton (`vous`/`tu`) respecté, texte ≤ 125 caractères ; Modérateur `can_fix` correct à 100 % | MVP | Banc de test |
| TR-AGT-06 | Analyste : **illégal évident** bloqué avant toute consommation de crédit | MVP | Banc de test |
| TR-AGT-07 | Modérateur appelé **uniquement après un refus** de la plateforme | MVP | Revue |
| TR-AGT-08 | Optimiseur : aucune action exécutée sans validation de l'utilisateur | MVP | Tests |

---

## 9. Médias (images, vidéos)

| ID | Exigence | Priorité | Vérification |
|---|---|---|---|
| TR-MED-01 | **Aucun texte, prix, numéro ou logo dessiné par l'IA** : posés par notre code (système en deux couches) | MVP | Contrôle OCR des scènes |
| TR-MED-02 | La **photo du produit n'est jamais redessinée** : détourée puis placée | MVP | Test de similarité |
| TR-MED-03 | Changer un texte, un numéro ou un logo : **instantané, sans IA, 0 crédit** | MVP | Test |
| TR-MED-04 | Format **4:5 par défaut** ; 9:16, 1:1, 1.91:1 à la demande, zones de sécurité Stories respectées | MVP | Test |
| TR-MED-05 | **Choix du modèle par l'utilisateur** dans une liste issue du catalogue ; un modèle « Recommandé » présélectionné ; **2 niveaux** (Standard, Haute qualité) ; coût en crédits affiché **avant** génération | MVP | Test manuel |
| TR-MED-06 | Un modèle n'est **visible** qu'après avoir réussi le banc de test | MVP | Revue du catalogue |
| TR-MED-07 | Files d'attente par fournisseur aux limites réelles : Higgsfield **20** par clé ; fal selon le compte ; BytePlus vidéo 3 (individuel) / 10 (entreprise) | MVP | Revue de configuration |
| TR-MED-08 | Bascule **proposée** (jamais imposée) si attente **> 60 s**, panne, solde bas ou **budget de 15 $/mois** du fournisseur atteint | MVP | Test simulé |
| TR-MED-09 | Notification et e-mail quand une génération se termine après que l'utilisateur a quitté la page | MVP | Test |
| TR-MED-10 | Un identifiant de requête fournisseur n'est **jamais facturé deux fois** ; aucune relance automatique d'un envoi au résultat ambigu | MVP | Tests automatiques |
| TR-MED-11 | Coût réel de chaque génération enregistré (recalcul des crédits) | MVP | Revue |
| TR-MED-12 | Vidéo : Wan 3.0 720p (Standard) et Seedance 2.5 720p (Premium), durées 5 / 10 / 15 / 30 s selon le modèle | V2 | Tests |

---

## 10. Crédits, abonnements, paiements

| ID | Exigence | Priorité | Vérification |
|---|---|---|---|
| TR-PAY-01 | Formules : Starter 5 000 XAF / 10 crédits · Pro 12 000 / 15 · Business 25 000 / 30 ; crédit supplémentaire **1 000 XAF** ; vidéo **2 crédits minimum** | MVP | Tests automatiques |
| TR-PAY-02 | **Registre des crédits** : réservation avant génération, consommation au succès, **libération** en cas d'échec, de contenu refusé ou d'annulation | MVP | Tests automatiques (succès, échec, double webhook) |
| TR-PAY-03 | Ordre de consommation : crédits du mois → bonus → achetés ; crédits du mois expirés en fin de période ; **crédits achetés jamais expirés** | MVP | Tests automatiques |
| TR-PAY-04 | Crédits d'une génération = `max(minimum, arrondi au-dessus(coût XAF ÷ seuil))` ; marge minimale : images et Wan **75 %**, Seedance **65 %** ; paramètres modifiables dans l'administration | MVP | Tests unitaires |
| TR-PAY-05 | Paiement SasPay par page hébergée, **activation uniquement sur webhook signé** (ou validation manuelle d'une preuve) | MVP | Tests |
| TR-PAY-06 | Aucun prélèvement automatique : rappels sur le site et par e-mail à J-3, J-1, J0 | MVP | Test de la tâche |
| TR-PAY-07 | **Grâce de 3 jours** (lecture, achat de crédits, mise en pause ; aucune création, génération ni modification : `workspace_read_only`), puis état **verrouillé** (tout refusé, lecture comprise : `workspace_locked`, sauf s'abonner, pause, support, compte) ; essai terminé sans abonnement = verrouillé tout de suite ; **mise en pause toujours possible, envoyée directement à Meta** ; à la fin de la grâce (ou d'un essai sans abonnement), **pause automatique de toutes les publicités du compte** (tâche `campaign.lock-pause`, toutes les 10 minutes, Meta d'abord et confirmé par relecture) puis **reprise manuelle** (« Reprendre mes pubs », `resume-all`, seulement les campagnes au motif `billing_lock`) après renouvellement : livrées en **S19b** (route `pause-all` comprise) (décision de la personne 26/10/2026) | MVP | Tests automatiques |
| TR-PAY-08 | Période d'abonnement à partir de la **date de souscription** ; passage à une formule supérieure = **paiement de la différence de prix**, même période, **différence de crédits ajoutée** | MVP | Tests |
| TR-PAY-09 | Frais SasPay **affichés et payés par le client** ; **aucun remboursement** | MVP | Revue |
| TR-PAY-10 | Essai : 1 campagne, 3 visuels, 7 jours, sans moyen de paiement, **un par compte** | MVP | Tests |
| TR-PAY-11 | Parrainage : **2 crédits bonus au parrain et 2 au filleul**, **uniquement au premier paiement** du filleul | MVP | Tests |
| TR-PAY-12 | Taux de change USD → monnaie locale de chacun des 54 pays d'Afrique : ExchangeRate-API (accès ouvert, une mise à jour par jour), périmé au-delà de 48 h (dollar seul), valeur forçable dans l'administration; TVA retirée pour le moment (décision du 17/10/2026), à réactiver sur décision | MVP | Tests |

---

## 11. Notifications et support

| ID | Exigence | Priorité | Vérification |
|---|---|---|---|
| TR-NOT-01 | Cloche dans l'application **et** e-mail (Resend), préférences par type | MVP | Test |
| TR-NOT-02 | E-mails en FR/EN selon la langue de l'utilisateur, envoyés depuis `notifications@pubeka.com` | MVP | Test |
| TR-NOT-03 | Séquence de bienvenue (J1, J3, J6) et résumé du lundi | MVP | Test des tâches |
| TR-SUP-01 | Tickets avec pièces jointes ; réponse depuis l'administration reçue **dans l'application et par e-mail** | MVP | Test |
| TR-SUP-02 | Preuve de paiement envoyée par l'utilisateur, visible et traitable dans l'administration | MVP | Test |

---

## 12. Administration

| ID | Exigence | Priorité | Vérification |
|---|---|---|---|
| TR-ADM-01 | Gestion des utilisateurs, abonnements, crédits (avec motif), campagnes, tickets | MVP | Test |
| TR-ADM-02 | **Vue comme le client** en lecture seule, journalisée | MVP | Test |
| TR-ADM-03 | Catalogue de modèles, niveaux, crédits, table de routage, budgets fournisseurs — **sans redéploiement** | MVP | Test |
| TR-ADM-04 | Tableaux : coûts IA par utilisateur / agent / modèle, temps d'attente moyen par file, soldes fournisseurs | MVP | Revue |
| TR-ADM-05 | Table de TVA, taux de change, bibliothèque de références, paramètres (prix du crédit, seuils, quotas, plafond quotidien, essai) | MVP | Test |

---

## 13. Site public et SEO

| ID | Exigence | Priorité | Vérification |
|---|---|---|---|
| TR-SEO-01 | Seules les pages publiques sont indexables ; application et administration en `noindex` et hors sitemap | MVP | Contrôle automatique |
| TR-SEO-02 | URL par langue (`/fr`, `/en`) reliées par **hreflang** | MVP | Contrôle automatique |
| TR-SEO-03 | Titre et description uniques, image Open Graph, données structurées (Organisation, Offres, FAQ, Article) | MVP | Validation Google |
| TR-SEO-04 | `sitemap.xml` et `robots.txt` générés automatiquement | MVP | Contrôle |
| TR-SEO-05 | Pages pays, guides d'aide publics, blog (rédigé par l'IA, publié après relecture) | MVP | Revue |
| TR-SEO-06 | Discours multi-plateforme : jamais « ta pub Facebook » dans la marque ; le nom d'une plateforme seulement là où l'utilisateur la choisit (et dans les guides ciblés) | MVP | Revue des textes |

---

## 14. Accessibilité

| ID | Exigence | Priorité | Vérification |
|---|---|---|---|
| TR-ACC-01 | Niveau **WCAG 2.2 AA** visé 🔶 | MVP | Audit automatique + manuel |
| TR-ACC-02 | Contraste du texte ≥ 4,5:1 (texte secondaire clair `#5C625B`) ; la Lime n'est jamais une couleur de texte sur fond clair | MVP | Contrôle |
| TR-ACC-03 | Focus clavier visible ; cibles tactiles ≥ 44 px ; aucun état porté par la couleur seule (point + mot) | MVP | Test manuel |

---

## 15. Observabilité et exploitation

| ID | Exigence | Priorité | Vérification |
|---|---|---|---|
| TR-OBS-01 | Erreurs suivies dans **Sentry**, usage dans **PostHog** | MVP | Revue |
| TR-OBS-02 | Alertes e-mail à l'administrateur : panne fournisseur, solde bas, budget 15 $ atteint, version API Meta, jeton expirant, échec de paiement en série | MVP | Tests des tâches |
| TR-OBS-03 | Intégration continue bloquante : typage, lint, tests unitaires, tests d'accès RLS, tests Meta portés, analyse des secrets, build | MVP | CI |
| TR-OBS-04 | Branches : `main` en production, branches courtes par pull request | MVP | Revue |
| TR-OBS-05 | Tâches planifiées listées dans l'architecture (§10) visibles avec leur historique (Trigger.dev Hobby en production) | MVP | Revue |

---

## 16. Coûts d'exploitation

| ID | Exigence | Priorité | Vérification |
|---|---|---|---|
| TR-CST-01 | Coût réel d'une génération **≤ 25 %** de son prix (images, Wan) et **≤ 35 %** (Seedance) | MVP | Rapport mensuel |
| TR-CST-02 | Budget maximal **15 $/mois par fournisseur média** au lancement, réglable | MVP | Administration |
| TR-CST-03 | Services payants activés seulement quand nécessaire : Supabase Pro (production, quand payé), Trigger.dev Hobby (au lancement) | MVP | Revue |

---

## 17. Critères d'acceptation du MVP

Le MVP est livrable quand **toutes** les conditions suivantes sont vraies :
1. Les tests portés de la création de campagnes Meta passent, et une campagne réelle est publiée sur un compte de test via Pubeka.
2. Un client peut, **sur téléphone** : s'inscrire, connecter Meta, coller un lien de site, obtenir une proposition, générer 3 visuels, publier, voir le statut et les statistiques.
3. Un paiement SasPay réel (environnement de test puis production) active un abonnement ; un échec de génération rend les crédits.
4. Les tests d'accès croisé RLS passent sur 100 % des tables.
5. L'App Review Meta est validée et la vérification d'entreprise acquise.
6. Politique de confidentialité, conditions d'utilisation et URL de suppression des données en ligne, relues.
7. Au moins **2 modèles d'image** par usage ont réussi le banc de test et sont visibles.
8. Les cibles de performance (§3) sont mesurées et tenues sur les pages publiques et le tableau de bord.

---

## 18. Cibles à confirmer (🔶)

| Sujet | Cible proposée |
|---|---|
| Navigateurs | 2 dernières versions |
| Core Web Vitals | LCP < 2,5 s · INP < 200 ms · CLS < 0,1 |
| Tableau de bord | interactif < 3 s en 4G |
| API interne | p95 < 500 ms |
| Premiers mots du Stratège | < 3 s |
| Disponibilité | ≥ 99,5 % / mois |
| Sauvegardes | RPO 24 h · RTO 4 h |
| Accessibilité | WCAG 2.2 AA |
