# 🐳 Guide Docker Complet pour AdsFacile

## 1. C'est quoi Docker ?

Docker est un outil qui **emballe ton application + tout ce dont elle a besoin** (Node.js, dépendances, config) dans un **conteneur** isolé et portable.

> **Analogie simple :** Imagine un colis Amazon. Peu importe qui le livre ou où il va, le contenu à l'intérieur reste le **même**. Docker fait pareil pour ton code.

### Sans Docker vs Avec Docker

| Sans Docker | Avec Docker |
|-------------|-------------|
| "Ça marche sur mon PC" mais crash en production | Marche **partout** de la même façon |
| Installer Node, Redis, PostgreSQL manuellement | Un seul `docker-compose up` lance tout |
| Conflits entre versions de Node/npm | Chaque projet a ses propres versions isolées |
| Config différente dev/staging/prod | Environnement **identique** partout |
| Déploiement manuel = risque d'erreur | Déploiement automatisé et reproductible |

---

## 2. Pourquoi Docker pour AdsFacile ?

### 🎯 Problèmes que Docker résout pour toi

1. **Environnement de développement unifié**
   - Tu installes Docker une seule fois, et tout le stack (Node, PostgreSQL, Redis) tourne sans config manuelle

2. **Déploiement simplifié**
   - Au lieu de configurer un serveur manuellement, tu push une image Docker et c'est fini

3. **Scalabilité**
   - Quand tu auras 1000+ utilisateurs, tu peux lancer 5 conteneurs backend au lieu d'1

4. **Isolation**
   - Le backend, le frontend, la BDD : chacun dans son conteneur, sans interférences

5. **CI/CD Pipeline**
   - Ton pipeline GitHub Actions build et teste dans des conteneurs Docker (c'est déjà dans ton `main.yml`)

---

## 3. Architecture Docker d'AdsFacile

```
┌──────────────────────────────────────────────────┐
│                 docker-compose.yml                │
│                                                    │
│  ┌─────────────┐  ┌──────────┐  ┌─────────────┐  │
│  │  Frontend    │  │ Backend  │  │   Redis      │  │
│  │  (Nginx)     │  │ (Node)   │  │  (Cache)     │  │
│  │  Port 80     │  │ Port 5000│  │  Port 6379   │  │
│  └──────┬──────┘  └────┬─────┘  └──────────────┘  │
│         │              │                            │
│         │         ┌────┴─────┐                     │
│         └────────►│ Supabase │ (externe, cloud)    │
│                   └──────────┘                     │
└──────────────────────────────────────────────────┘
```

> **Note :** Supabase reste en cloud (pas en conteneur), mais tout le reste tourne en Docker.

---

## 4. Fichiers Docker pour AdsFacile

### 4.1 Backend — `backend/Dockerfile`

```dockerfile
# ── Étape 1 : Build ──
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# ── Étape 2 : Production ──
FROM node:18-alpine
WORKDIR /app

# Sécurité : ne pas tourner en root
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copier les dépendances buildées
COPY --from=builder /app/node_modules ./node_modules
COPY ./src ./src
COPY package.json ./

# Variables d'environnement
ENV NODE_ENV=production
ENV PORT=5000

# Exposer le port
EXPOSE 5000

# Changer d'utilisateur (sécurité)
USER appuser

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget -qO- http://localhost:5000/health || exit 1

# Démarrer l'app
CMD ["node", "src/server.js"]
```

### 4.2 Frontend — `frontend/Dockerfile`

```dockerfile
# ── Étape 1 : Build React ──
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Étape 2 : Servir avec Nginx ──
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

### 4.3 Nginx Config — `frontend/nginx.conf`

```nginx
server {
    listen 80;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    # React Router : toutes les routes → index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API vers le backend
    location /api/ {
        proxy_pass http://backend:5000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Cache statique
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript;
}
```

### 4.4 Docker Compose Dev — `docker-compose.dev.yml`

```yaml
version: '3.8'

services:
  # ── Backend Node.js ──
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "5000:5000"
    env_file:
      - ./backend/.env
    volumes:
      # Hot reload : tes changements apparaissent en temps réel
      - ./backend/src:/app/src
    depends_on:
      redis:
        condition: service_healthy
    restart: unless-stopped
    networks:
      - adsfacile-network

  # ── Frontend React (dev server) ──
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.dev
    ports:
      - "5173:5173"
    volumes:
      - ./frontend/src:/app/src
    environment:
      - VITE_API_URL=http://localhost:5000/api
    depends_on:
      - backend
    networks:
      - adsfacile-network

  # ── Redis (cache & sessions) ──
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - adsfacile-network

volumes:
  redis-data:

networks:
  adsfacile-network:
    driver: bridge
```

### 4.5 Docker Compose Production — `docker-compose.yml`

```yaml
version: '3.8'

services:
  backend:
    image: ghcr.io/ton-username/adsfacile-backend:latest
    ports:
      - "5000:5000"
    env_file:
      - .env.production
    depends_on:
      redis:
        condition: service_healthy
    restart: always
    deploy:
      replicas: 2             # 2 instances pour la haute dispo
      resources:
        limits:
          memory: 512M
          cpus: '0.5'
    networks:
      - adsfacile-network

  frontend:
    image: ghcr.io/ton-username/adsfacile-frontend:latest
    ports:
      - "80:80"
      - "443:443"
    depends_on:
      - backend
    restart: always
    networks:
      - adsfacile-network

  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: always
    networks:
      - adsfacile-network

volumes:
  redis-data:

networks:
  adsfacile-network:
    driver: bridge
```

---

## 5. Commandes Docker Essentielles

### Développement quotidien

```bash
# Lancer tout le stack en développement
docker-compose -f docker-compose.dev.yml up

# Lancer en arrière-plan (détaché)
docker-compose -f docker-compose.dev.yml up -d

# Voir les logs en temps réel
docker-compose -f docker-compose.dev.yml logs -f backend

# Arrêter tout
docker-compose -f docker-compose.dev.yml down

# Rebuilder après changement de dépendances (npm install)
docker-compose -f docker-compose.dev.yml up --build
```

### Production

```bash
# Déployer en production
docker-compose up -d

# Voir le statut des conteneurs
docker-compose ps

# Mettre à jour (nouvelle version)
docker-compose pull && docker-compose up -d

# Voir les ressources utilisées
docker stats
```

### Debugging

```bash
# Entrer dans un conteneur
docker exec -it adsfacile-backend sh

# Voir les logs d'un service
docker-compose logs backend --tail=100

# Inspecter un conteneur
docker inspect adsfacile-backend

# Nettoyer les images/conteneurs inutiles
docker system prune -a
```

---

## 6. Workflow Docker pour AdsFacile

```
 Développeur                     CI/CD                       Production
 ──────────                      ──────                      ──────────
     │                              │                             │
     │  git push                    │                             │
     ├─────────────────────────────►│                             │
     │                              │  docker build               │
     │                              ├──────────┐                  │
     │                              │          │ Build image      │
     │                              │◄─────────┘                  │
     │                              │                             │
     │                              │  docker run tests           │
     │                              ├──────────┐                  │
     │                              │          │ Tests passent    │
     │                              │◄─────────┘                  │
     │                              │                             │
     │                              │  docker push (registry)     │
     │                              ├────────────────────────────►│
     │                              │                             │  docker pull
     │                              │                             │  docker-compose up
     │                              │                             │
     │  ✅ Déployé !                │                             │
     │◄───────────────────────────────────────────────────────────┤
```

---

## 7. Quand utiliser Docker dans ton projet

| Phase | Utilise Docker ? | Pourquoi |
|-------|:----------------:|----------|
| **Dev solo (maintenant)** | ⚡ Optionnel | Redis en Docker, backend en local c'est OK |
| **Collaborateurs** | ✅ Oui | Tout le monde a le même environnement |
| **CI/CD tests** | ✅ Oui | Déjà dans ton `main.yml` |
| **Staging** | ✅ Oui | Environnement identique à la prod |
| **Production** | ✅ Oui | Déploiement fiable et scalable |

### 💡 Recommandation pour toi maintenant

Pour ta phase actuelle (dev solo, MVP), tu peux :
1. **Utiliser Docker seulement pour Redis** (simple à lancer)
2. **Garder le backend en local** avec `node src/server.js` (plus rapide pour le hot reload)
3. **Quand tu auras un collaborateur ou que tu déploies**, passer à Docker Compose complet

---

## 8. Installation Docker

### Windows
1. Télécharger [Docker Desktop](https://www.docker.com/products/docker-desktop/)
2. Installer et redémarrer
3. Ouvrir un terminal : `docker --version` pour vérifier

### Vérification rapide
```bash
docker --version          # Docker version 24.x
docker-compose --version  # Docker Compose v2.x
docker run hello-world    # Test que tout fonctionne
```

---

## 9. Variables d'environnement — `.env.production`

```env
# Backend
NODE_ENV=production
PORT=5000
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
JWT_SECRET=ton-secret-ultra-long-minimum-32-caracteres
OPENAI_API_KEY=sk-...
FACEBOOK_APP_ID=123456
FACEBOOK_APP_SECRET=abc...

# Redis
REDIS_URL=redis://redis:6379
REDIS_PASSWORD=ton-mot-de-passe-redis

# Email
SMTP_HOST=smtp.gmail.com
SMTP_USER=noreply@adsfacile.cm
SMTP_PASS=xxx

# Payments
MESOMB_API_KEY=xxx
MESOMB_SECRET=xxx
```

> ⚠️ **IMPORTANT :** Ne jamais commit le fichier `.env` ! Ajoute-le dans `.gitignore`.
