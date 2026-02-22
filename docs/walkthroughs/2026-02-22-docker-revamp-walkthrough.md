# Docker Dev Setup — Walkthrough

## What Was Done

Created a **one-command Docker dev setup** that launches both the backend and frontend with hot reload.

### Files Created / Modified

| File | Action | Purpose |
|------|--------|---------|
| [Dockerfile.dev](file:///c:/Users/DELL/Documents/GitHub/Adfacile/Dockerfile.dev) | **NEW** | Vite dev server (Node 20, port 5173) |
| [backend/Dockerfile.dev](file:///c:/Users/DELL/Documents/GitHub/Adfacile/backend/Dockerfile.dev) | **NEW** | Nodemon dev server (Node 20, port 5000) |
| [docker-compose.dev.yml](file:///c:/Users/DELL/Documents/GitHub/Adfacile/docker-compose.dev.yml) | **MODIFIED** | Orchestrates both services with hot reload |

### Key Changes to `docker-compose.dev.yml`
- Uses `Dockerfile.dev` files (dev servers) instead of production Dockerfiles (Nginx/static)
- Frontend/backend source code is **volume-mounted** for live hot reload
- **Removed unused Redis** dependency
- Uses `node:20-alpine` (required by Vite v7)

### Clean Rebuild Done
- Removed all old AdFacile images and dangling layers
- Rebuilt from scratch using `docker compose -f docker-compose.dev.yml up --build -d`
- Stopped and removed leftover `adsfacile-redis` container

## How to Use

```bash
# Launch both services
docker compose -f docker-compose.dev.yml up --build

# Stop everything
docker compose -f docker-compose.dev.yml down
```

## Verification

Both services confirmed running and accessible:

````carousel
![Backend health check — returns {"status":"UP"} on port 5000](file:///c:/Users/DELL/Documents/GitHub/Adfacile/docs/assets/docker_setup/backend_health.png)
<!-- slide -->
![Frontend landing page loaded on port 5173](file:///c:/Users/DELL/Documents/GitHub/Adfacile/docs/assets/docker_setup/frontend_landing.png)
<!-- slide -->
![Verification Recording](file:///c:/Users/DELL/Documents/GitHub/Adfacile/docs/assets/docker_setup/verification_recording.webp)
````
