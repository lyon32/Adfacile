# AdsFacile - Système d'Inscription

## 📋 Vue d'ensemble

Système d'inscription complet pour AdsFacile, un SaaS de gestion de publicités Facebook destiné aux entrepreneurs camerounais.

### Technologies utilisées

**Backend:**
- Node.js + Express
- Supabase (PostgreSQL)
- bcryptjs (hashage mot de passe)
- jsonwebtoken (JWT)
- express-validator (validation)

**Frontend:**
- React + Vite + TypeScript
- Tailwind CSS
- Axios
- React Router

---

## 🚀 Installation

### 1. Cloner et installer les dépendances

```bash
# Backend
cd backend
npm install

# Frontend (depuis la racine)
npm install
```

### 2. Configuration des variables d'environnement

#### Backend (`backend/.env`)

Copiez `backend/.env.example` vers `backend/.env` et remplissez :

```env
PORT=5000
NODE_ENV=development

# Supabase - Trouvez ces valeurs dans Settings > API
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_KEY=eyJhbGc...

# JWT - Générez un secret fort
JWT_SECRET=votre_secret_minimum_32_caracteres
JWT_EXPIRE=24h

FRONTEND_URL=http://localhost:5173
```

#### Frontend (`.env`)

Copiez `.env.example` vers `.env` :

```env
VITE_API_URL=http://localhost:5000/api
```

### 3. Configuration Supabase

1. Créez un projet sur [supabase.com](https://supabase.com)
2. Allez dans SQL Editor
3. Exécutez le contenu de `backend/supabase-schema.sql`

---

## 🏃 Démarrage

### Backend

```bash
cd backend
npm run dev
```

Le serveur démarre sur `http://localhost:5000`

### Frontend

```bash
npm run dev
```

L'application démarre sur `http://localhost:5173`

---

## 📡 API Endpoints

### POST `/api/auth/signup`

Inscription d'un nouvel utilisateur.

**Body (JSON):**

| Champ | Type | Requis | Description |
|-------|------|--------|-------------|
| `email` | string | ✅ | Email unique |
| `password` | string | ✅ | Min 8 chars, 1 maj, 1 min, 1 chiffre |
| `confirmPassword` | string | ✅ | Doit correspondre |
| `phone` | string | ✅ | Format +237XXXXXXXXX |
| `first_name` | string | ❌ | Prénom |
| `last_name` | string | ❌ | Nom |
| `business_name` | string | ❌ | Nom entreprise |
| `niche` | string | ❌ | Secteur d'activité |
| `city` | string | ❌ | Ville (défaut: Douala) |
| `accept_terms` | boolean | ✅ | Doit être true |
| `newsletter` | boolean | ❌ | Inscription newsletter |

**Réponses:**

- `201 Created` - Succès
```json
{
  "success": true,
  "message": "Compte créé avec succès",
  "data": {
    "user": { "id", "email", "phone", "plan", "ai_credits" },
    "token": "jwt_token"
  }
}
```

- `400 Bad Request` - Erreur de validation
- `409 Conflict` - Email ou téléphone déjà utilisé
- `500 Server Error` - Erreur serveur

### GET `/api/health`

Vérification de l'état de l'API.

---

## 📁 Structure des fichiers

```
Adfacile/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── supabase.js          # Client Supabase
│   │   ├── controllers/
│   │   │   └── authController.js    # Logique signup
│   │   ├── middleware/
│   │   │   └── validateSignup.js    # Validation express-validator
│   │   ├── routes/
│   │   │   └── auth.js              # Routes /api/auth
│   │   ├── utils/
│   │   │   └── validation.js        # Utilitaires validation
│   │   └── server.js                # Serveur Express
│   ├── supabase-schema.sql          # Schema SQL
│   ├── .env.example
│   └── package.json
│
├── src/
│   ├── components/
│   │   └── PasswordStrengthIndicator.jsx
│   ├── pages/
│   │   ├── SignupPage.jsx           # Page inscription
│   │   └── DashboardPage.jsx        # Page après inscription
│   ├── services/
│   │   └── api.js                   # Client Axios
│   ├── utils/
│   │   └── signupValidation.js      # Validation frontend
│   └── App.tsx                      # Router principal
│
├── .env.example
└── README-SIGNUP.md
```

---

## ✅ Tests manuels

### Backend (avec curl)

```bash
# Test inscription valide
curl -X POST http://localhost:5000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123456",
    "confirmPassword": "Test123456",
    "phone": "+237612345678",
    "city": "Douala",
    "accept_terms": true
  }'

# Test santé API
curl http://localhost:5000/api/health
```

### Frontend

1. Ouvrir `http://localhost:5173/signup`
2. Remplir le formulaire
3. Vérifier les validations en temps réel
4. Soumettre et vérifier la redirection vers `/dashboard`

---

## 🔒 Sécurité

- ✅ Mots de passe hashés avec bcrypt (10 rounds)
- ✅ JWT signé avec secret fort
- ✅ Validation côté serveur ET client
- ✅ Sanitization des inputs (XSS prevention)
- ✅ CORS configuré
- ✅ Row Level Security Supabase activée

---

## 📝 Notes

- Les boutons OAuth (Facebook, Google) sont des placeholders désactivés
- Le dashboard est une page simplifiée de bienvenue
- Pour la production, changez `NODE_ENV=production` et utilisez HTTPS
