# AdLaunch Pro 🚀

**Simplifiez la création de vos campagnes publicitaires Facebook Business**

AdLaunch Pro est une plateforme web moderne qui facilite la gestion et la création de campagnes publicitaires sur Facebook Business. Avec une interface intuitive et une intégration directe à l'API Facebook, lancez vos publicités en quelques clics.

## ✨ Fonctionnalités

- 🎨 **Page vitrine professionnelle** - Présentation complète du service
- 🔐 **Système d'authentification** - Inscription et connexion sécurisées
- 📱 **Intégration Facebook Business** - Connexion OAuth avec Facebook
- 🎯 **Ciblage avancé** - Définissez précisément votre audience
- 💰 **Gestion du budget** - Contrôlez vos dépenses publicitaires
- 📊 **Dashboard intuitif** - Gérez toutes vos campagnes en un seul endroit
- 🚀 **Création rapide** - Lancez une campagne en moins de 5 minutes

## 📋 Prérequis

Pour utiliser pleinement AdLaunch Pro avec l'intégration Facebook, vous devez :

1. Un compte Facebook Business Manager
2. Une application Facebook Developer (voir configuration ci-dessous)
3. Un navigateur web moderne (Chrome, Firefox, Edge)

## 🛠️ Configuration Facebook App

### Étape 1 : Créer une Application Facebook

1. Allez sur [Facebook Developers](https://developers.facebook.com/apps/)
2. Cliquez sur "Créer une app"
3. Sélectionnez le type "Business"
4. Remplissez les informations de base

### Étape 2 : Configurer l'Application

1. Dans le tableau de bord de votre app, notez votre **App ID**
2. Allez dans **Paramètres > Basique** et notez votre **App Secret**
3. Ajoutez le produit **Facebook Login**
4. Dans **Facebook Login > Paramètres**, ajoutez vos URIs de redirection :
   ```
   http://localhost:8000/dashboard.html
   https://votre-domaine.com/dashboard.html
   ```

### Étape 3 : Demander les Permissions

Dans **Révision de l'app**, demandez les permissions suivantes :
- `ads_management` - Gérer les publicités
- `ads_read` - Lire les données publicitaires
- `business_management` - Gérer les comptes Business
- `pages_read_engagement` - Lire l'engagement des pages
- `pages_manage_ads` - Gérer les publicités des pages

### Étape 4 : Configurer AdLaunch Pro

Ouvrez le fichier `config.js` et remplacez les valeurs :

```javascript
const CONFIG = {
    facebook: {
        appId: 'VOTRE_APP_ID_ICI',
        appSecret: 'VOTRE_APP_SECRET_ICI',
        // ... reste de la configuration
    }
};
```

⚠️ **Important** : Ne partagez JAMAIS votre App Secret publiquement !

## 🚀 Installation et Lancement

### Option 1 : Serveur Local Simple

```bash
# Naviguez vers le dossier du projet
cd adlaunch-pro

# Lancez un serveur HTTP local (Python 3)
python -m http.server 8000

# Ou avec Node.js (si vous avez http-server installé)
npx http-server -p 8000
```

Ouvrez votre navigateur à : `http://localhost:8000`

### Option 2 : Ouvrir Directement

Vous pouvez aussi ouvrir `index.html` directement dans votre navigateur, mais certaines fonctionnalités Facebook nécessiteront un serveur local.

## 📁 Structure du Projet

```
adlaunch-pro/
├── index.html              # Page d'accueil (vitrine)
├── auth.html              # Page d'authentification
├── dashboard.html         # Dashboard principal
├── styles.css             # Styles CSS globaux
├── app.js                 # JavaScript principal
├── auth.js                # Logique d'authentification
├── config.js              # Configuration (Facebook App ID)
├── facebook-sdk.js        # Intégration Facebook SDK
└── README.md              # Ce fichier
```

## 🎯 Guide d'Utilisation

### 1. Page d'Accueil
- Découvrez les fonctionnalités d'AdLaunch Pro
- Consultez les avantages et la méthodologie
- Cliquez sur "Commencer" pour créer un compte

### 2. Inscription/Connexion
- Créez un compte avec email et mot de passe
- Ou utilisez la connexion Facebook (après configuration)
- Le mot de passe doit être fort (indicateur de force inclus)

### 3. Dashboard
- Connectez votre compte Facebook Business
- Créez une nouvelle campagne publicitaire
- Remplissez tous les champs nécessaires :
  - **Informations de base** : Nom, objectif
  - **Budget** : Budget quotidien, dates
  - **Ciblage** : Pays, âge, genre, intérêts
  - **Contenu** : Titre, texte, image, CTA

### 4. Lancement
- Vérifiez tous les paramètres
- Cliquez sur "Créer la Campagne"
- La campagne sera créée en mode "Pause" pour révision
- Activez-la depuis Facebook Business Manager

## 🎨 Design et Technologies

### Technologies Utilisées
- **HTML5** - Structure sémantique
- **CSS3** - Design moderne avec variables CSS
- **JavaScript Vanilla** - Logique sans frameworks
- **Facebook SDK** - Intégration API Facebook

### Principes de Design
- ✨ Design moderne avec gradients et glassmorphism
- 🎭 Animations fluides et micro-interactions
- 📱 Responsive design (mobile, tablette, desktop)
- 🎨 Palette de couleurs premium
- 🔤 Typographie Google Fonts (Inter)

## 🔒 Sécurité

- Validation côté client pour tous les formulaires
- Stockage sécurisé des sessions (localStorage/sessionStorage)
- OAuth 2.0 pour l'authentification Facebook
- Aucune donnée sensible stockée en clair

## 🐛 Dépannage

### La connexion Facebook ne fonctionne pas
- Vérifiez que votre App ID est correct dans `config.js`
- Assurez-vous que l'URI de redirection est configurée
- Vérifiez que votre app est en mode "Live" (pas "Development")

### Les campagnes ne se créent pas
- Vérifiez que vous avez les permissions nécessaires
- Assurez-vous d'avoir un compte publicitaire Facebook
- Consultez la console du navigateur pour les erreurs

### Problèmes d'affichage
- Utilisez un navigateur moderne à jour
- Videz le cache du navigateur
- Vérifiez que JavaScript est activé

## 📝 Notes Importantes

- **Mode Développement** : Pour tester sans Facebook, utilisez les formulaires d'authentification classiques
- **Production** : Configurez HTTPS et un nom de domaine pour la production
- **Limites API** : Respectez les limites de l'API Facebook Business
- **Révision** : Les campagnes sont créées en pause pour permettre la révision

## 🚀 Prochaines Étapes

Pour améliorer AdLaunch Pro :
- [ ] Ajouter l'analytique en temps réel
- [ ] Implémenter la modification de campagnes existantes
- [ ] Ajouter des templates de publicités
- [ ] Créer un système de rapports PDF
- [ ] Intégrer d'autres plateformes (Google Ads, Instagram)

## 📄 Licence

Ce projet est un prototype de démonstration. Adaptez-le selon vos besoins.

## 💡 Support

Pour toute question ou problème :
1. Consultez la documentation Facebook Developers
2. Vérifiez la console du navigateur pour les erreurs
3. Assurez-vous que toutes les configurations sont correctes

---

**AdLaunch Pro** - Simplifiez vos publicités Facebook Business 🚀
