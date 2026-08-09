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

# L'API est jointe par un chemin relatif, que Nginx relaie vers le backend
# (voir nginx.conf). Sans cette valeur, le bundle retombe sur l'URL absolue
# http://localhost:5000 : le navigateur passe alors en requête inter-origines
# depuis http://localhost et le backend la refuse, faute d'y être autorisé.
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL

RUN npx vite build

# ── Étape 2 : Servir avec Nginx ──
FROM nginx:alpine

# Copier le build React
COPY --from=builder /app/dist /usr/share/nginx/html

# Copier la config Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
