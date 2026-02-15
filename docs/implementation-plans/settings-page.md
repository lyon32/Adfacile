# Page Paramètres AdsFacile - Plan d'Implémentation

Création d'une page de paramètres complète et professionnelle permettant aux utilisateurs de gérer leur profil, connexions Facebook, notifications, sécurité, préférences, équipe et compte.

## Proposed Changes

### Structure HTML — [NEW] settings.html

Page complète avec:
- **Header** réutilisé du dashboard avec navigation et menu utilisateur
- **Sidebar navigation** avec 7 sections:
  - 👤 Profil
  - 🔗 Connexions Facebook
  - 🔔 Notifications
  - 🔒 Sécurité
  - 🌍 Préférences
  - 👥 Équipe (badge Agency)
  - 🗑️ Compte

**7 sections de contenu:**
1. **Profil**: Photo, infos personnelles, infos professionnelles, bio
2. **Connexions Facebook**: Comptes connectés, permissions, synchronisation
3. **Notifications**: Email, WhatsApp, Push, fréquence
4. **Sécurité**: Mot de passe, 2FA, sessions, historique, codes récupération
5. **Préférences**: Langue, devise, apparence, dashboard, campagnes
6. **Équipe**: Membres, rôles, permissions, invitations
7. **Compte**: Suppression, pause abonnement

**Modals**: Changement mot de passe, Activation 2FA, Suppression compte (confirmation), Invitation membre, Upload photo

---

### Styles CSS — [NEW] css/settings.css

- Layout: Sidebar fixe + contenu scrollable
- Navigation sidebar: États actifs, hover, transitions
- Formulaires: Focus states (border vert), validation temps réel, badges
- Boutons: Primaire (gradient vert), Secondaire (border gris), Danger (rouge), Loading states
- Responsive mobile: Sidebar → tabs horizontaux, inputs pleine largeur

---

### JavaScript — [NEW] js/settings.js

- Navigation hash URLs
- Upload photo: Preview avant upload
- Validation formulaires en temps réel
- Toast notifications (success, error, warning, info)
- Modals: Open/close avec animations
- Confirmation suppression: Validation texte "SUPPRIMER" + mot de passe
- Sauvegarde: Détection changements non sauvés
- Keyboard navigation

## Verification Plan

1. Navigation: Vérifier sections accessibles et hash URLs
2. Formulaires: Validation temps réel et sauvegarde
3. Modals: Ouverture/fermeture et animations
4. Responsive: Test mobile (< 768px)
5. Toast notifications: Affichage et auto-dismiss
6. Accessibilité: Navigation clavier et contraste
