# AdsFacile Dashboard - Walkthrough

## 🎯 Objectif

Création d'un dashboard professionnel et complet pour **AdsFacile**, une plateforme SaaS de publicité Facebook ciblant les entrepreneurs africains. Le dashboard permet de gérer des campagnes publicitaires avec une interface moderne, intuitive et riche en fonctionnalités.

---

## ✅ Pages Créées

### 1. dashboard.html - Vue d'ensemble

**Page principale du dashboard** affichant un aperçu complet des performances.

#### Fonctionnalités :
- **En-tête personnalisé** avec salutation et bouton "Nouvelle Campagne"
- **4 cartes statistiques** : Budget dépensé, Impressions, Clics, Conversions (avec indicateurs de changement)
- **Graphique de performance** (Chart.js) affichant les 30 derniers jours
- **Section Campagnes Actives** : 3 campagnes avec métriques clés et actions rapides
- **Recommandations IA** : 3 cartes avec conseils personnalisés (warning, success, info)
- **Connexions Facebook** : Gestion des comptes connectés
- **Actions Rapides** : Liens vers création d'annonces IA, rapports, ajustements budget

---

### 2. campaigns.html - Liste des Campagnes

**Page de gestion des campagnes** avec options de filtrage et visualisation.

#### Fonctionnalités :
- **Barre de filtres** : Recherche temps réel, filtrage par statut, tri, toggle vue grille/liste
- **Vue Grille** : Cartes détaillées (Budget/jour, Dépensé, Impressions, Clics, CTR, Étoiles)
- **Vue Liste** : Tableau compact avec toutes les métriques
- **Pagination** : Navigation entre pages de résultats

---

### 3. campaigns-new.html - Wizard de Création (6 étapes)

**Wizard multi-étapes** pour créer une nouvelle campagne publicitaire.

**Étape 1 : Informations de Base** — Sélection niche (11 options), nom, description, objectif (6 options), recommandation IA

**Étape 2 : Ciblage d'Audience** — Localisation + rayon (slider 1-25 km), âge, genre, intérêts avec tags, suggestions IA avec scores, estimation audience temps réel

**Étape 3 : Budget & Calendrier** — Budget quotidien (FCFA), projection auto, estimations (Impressions, Clics, CPC, Conversions, CPA), horaires optimaux

**Étape 4 : Créatif Publicitaire** — Upload image (drag & drop), IA DALL-E / Template Canva / Bibliothèque stock, texte (125 chars), titre (40 chars), destination (WhatsApp/Site/Messenger/Formulaire), CTA (7 options)

**Étape 5 : Révision** — Récapitulatif complet, validation IA, estimations finales

**Étape 6 : Lancement** — Confirmation + redirection

---

### 4. campaign-detail.html - Détails de Campagne

**Page de détails complète** pour analyser et gérer une campagne spécifique.

- **5 cartes de performance** : Budget, Impressions, Clics, Conversions, Performance
- **4 Onglets** : Vue d'ensemble (Chart.js, 8 KPIs, IA), Audience (breakdowns âge/genre/appareil), Créatif (aperçu pub style Facebook), Paramètres (budget, calendrier, actions)

---

## 🎨 Composants Partagés

### css/dashboard.css
Design system complet (310 lignes) : Variables CSS, Layout, Sidebar, Header, Cards, Stats Grid, Badges, Buttons, Responsive (768px, 1024px)

### js/dashboard.js
Utilitaires (238 lignes) : Données démo, `formatNumber()`, `formatCurrency()`, `generatePerformanceStars()`, `createStatusBadge()`, Chart.js, LocalStorage

---

## 📊 Résumé Technique

- **Technologies** : HTML5, CSS3, JavaScript (Vanilla), Chart.js, Phosphor Icons, Google Fonts Inter
- **4 pages HTML**, **1 fichier CSS** (310 lignes), **1 fichier JS** (238 lignes)
- **Design** : Couleur primaire Vert (#10B981), Secondaire Bleu (#3B82F6), Devise FCFA, Localisation Douala

---

## 🎯 Prochaines Étapes

1. analytics.html - Analytiques avancées
2. settings.html - Paramètres du compte
3. billing.html - Facturation
4. help.html - Centre d'aide
