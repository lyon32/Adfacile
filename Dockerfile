# ═══════════════════════════════════════════════════════════════
# AdsFacile Frontend - Dockerfile
# Build React + servir avec Nginx
# ═══════════════════════════════════════════════════════════════

# ── Étape 1 : Build React/Vite ──
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx vite build

# ── Étape 2 : Servir avec Nginx ──
FROM nginx:alpine

# Copier le build React
COPY --from=builder /app/dist /usr/share/nginx/html

# Copier la config Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
