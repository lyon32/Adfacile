# Docker Dev Setup — Launch Backend & Frontend Together

The existing `docker-compose.dev.yml` has two issues:
1. **Frontend** uses the production Nginx Dockerfile (static build) instead of Vite's dev server — no hot reload
2. **Redis** dependency is declared but the backend code doesn't use Redis at all

We'll fix the dev compose to give you a **one-command launch** with hot reload on both services.

## Proposed Changes

### Frontend Dev Docker

#### [NEW] [Dockerfile.dev](file:///c:/Users/DELL/Documents/GitHub/Adfacile/Dockerfile.dev)
A lightweight dev Dockerfile that runs `npm run dev` with Vite instead of building and serving via Nginx:
- Based on `node:18-alpine`
- Installs dependencies with `npm ci`
- Runs `vite --host` (so the container is reachable from the host)
- Exposes port `5173`

---

### Backend Dev Docker

#### [NEW] [backend/Dockerfile.dev](file:///c:/Users/DELL/Documents/GitHub/Adfacile/backend/Dockerfile.dev)
A dev Dockerfile that runs `nodemon` for hot reload:
- Based on `node:18-alpine`
- Installs all dependencies (including `nodemon`)
- Runs `npm run dev`
- Exposes port `5000`

---

### Docker Compose

#### [MODIFY] [docker-compose.dev.yml](file:///c:/Users/DELL/Documents/GitHub/Adfacile/docker-compose.dev.yml)
- **Frontend**: Use `Dockerfile.dev`, expose `5173`, mount `src/` for hot reload
- **Backend**: Use `backend/Dockerfile.dev`, mount `backend/src/` for hot reload, pass `.env` into container
- **Remove Redis** service (unused)
- **Remove Redis** volume and network simplification
- Update `FRONTEND_URL` env to `http://localhost:5173` (Vite dev URL)

## Verification Plan

### Manual Verification
1. Run `docker compose -f docker-compose.dev.yml up --build`
2. Verify backend is reachable at `http://localhost:5000/health` → should return `{ "status": "UP" }`
3. Verify frontend is reachable at `http://localhost:5173` → should load the React app
4. Test hot reload: edit a frontend file, confirm browser updates automatically
