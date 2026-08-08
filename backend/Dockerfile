# ═══════════════════════════════════════════════════════════════
# AdsFacile Backend - Dockerfile
# Multi-stage build pour une image légère et sécurisée
# ═══════════════════════════════════════════════════════════════

# ── Étape 1 : Installer les dépendances ──
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# ── Étape 2 : Image de production ──
FROM node:20-alpine
WORKDIR /app

# Sécurité : ne pas tourner en root
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copier les dépendances depuis l'étape précédente
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

# Dossier de logs inscriptible par appuser (Winston y ecrit error.log et all.log)
RUN mkdir -p logs && chown -R appuser:appgroup logs

# Variables d'environnement
ENV NODE_ENV=production
ENV PORT=5000

# Exposer le port
EXPOSE 5000

# Changer d'utilisateur (sécurité)
USER appuser

# Healthcheck - vérifie que le serveur répond
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -qO- "http://localhost:${PORT}/health" || exit 1

# Démarrer le serveur
CMD ["node", "src/server.js"]
