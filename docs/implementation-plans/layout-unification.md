# Plan d'Unification et de Correction du Layout CSS

Ce plan vise à corriger les problèmes d'affichage (layout cassé) signalés, en uniformisant la structure HTML et les liens CSS sur l'ensemble des pages du tableau de bord.

## Problèmes Identifiés
- Structure HTML incohérente dans `billing.html` (sidebar manquante).
- Liens CSS manquants dans `settings.html` (`dashboard.css` non inclus).
- Styles inline intrusifs (hacks) qui surchargent le CSS global et cassent le positionnement `fixed`.
- Incohérence des informations de plan ("Gratuit" vs "Pro") entre les pages.

## Changements Proposés

### 1. Uniformisation du Header et de la Structure
Toutes les pages suivantes adopteront la même structure parente :
- `dashboard.html`
- `campaigns.html`
- `billing.html`
- `settings.html`
- `campaign-detail.html`
- `campaigns-new.html`

**Structure cible :**
```html
<div class="dashboard-layout">
    <aside class="dashboard-sidebar">...</aside>
    <div class="main-wrapper" style="flex: 1; display: flex; flex-direction: column;">
        <header class="dashboard-header">...</header>
        <main class="dashboard-main">...</main>
    </div>
</div>
```

### 2. Nettoyage des Styles Inline
Suppression des attributs `style` sur `.dashboard-header` et `.dashboard-main` pour laisser `dashboard.css` gérer le positionnement.

### 3. Corrections de Liens CSS
Ajout de `css/dashboard.css` dans `settings.html` et vérification dans les autres fichiers.

### 4. Harmonisation du Dashboard JS
S'assurer que `js/dashboard.js` est inclus partout et que les sélecteurs (`#userMenuToggle`, etc.) sont présents.

## Plan de Vérification

1. **Vérification Visuelle** : Ouvrir chaque page, vérifier sidebar à gauche, header en haut, contenu aligné.
2. **Toggle Dropdown** : Menu utilisateur sur chaque page.
3. **Responsive** : Réduire la largeur pour vérifier le menu mobile.
4. **Navigation** : Passer d'une page à l'autre via la sidebar, vérifier l'état actif.
