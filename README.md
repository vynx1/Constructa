#PS: Deployment Will Not Work due to API Key's. Please watch the Demo video at the Devpost here instead: 
https://devpost.com/software/constructa?_gl=1*h2wsbf*_gcl_au*MTIyOTUwMDE2Ni4xNzc3NzUyNzM4*_ga*MjAzOTY4MjA4NC4xNzc3NzUyNzM4*_ga_0YHJK3Y10M*czE3ODIzMjA1MjEkbzkkZzEkdDE3ODIzMjA1NTUkajI2JGwwJGgw


## Stack

| Layer        | Choice                                              |
| ------------ | --------------------------------------------------- |
| Framework    | TanStack Start (React, SSR, file routing)           |
| Data         | TanStack Query                                      |
| 3D           | Three.js via React Three Fiber + drei               |
| Animation    | GSAP + ScrollTrigger                                |
| Map          | MapLibre GL + deck.gl                               |
| Auth         | Clerk                                               |
| Web API      | Hono (mounted inside TanStack Start at `/api/*`)    |
| State/cache  | Redis                                               |
| LLM          | Fetch.AI                               |
| Agent svc    | Python FastAPI (Deepgram + Fetch.ai watchdog)       |


## Prerequisites

- Node `>=20` (uses npm; a `package-lock.json` is committed)
- Optional: Docker (for the one-command full stack), Python `3.12` (agent service)

## Quick start (frontend only)

```bash
npm install
cp .env.example .env      # optional — fill in keys to enable live services
npm run dev               # http://localhost:3000
```
## Project layout

```
src/
  routes/            # file-based routes
    index.tsx        # Page 1 — landing (3D hero)
    map/index.tsx    # Page 2 — national map
    product/index.tsx# Page 3 — live build sequence
    api/$.ts         # catch-all -> Hono web API
  components/        # landing / map / product / ui
  lib/               # redis, claude, clerk (all env-guarded)
  server/api.ts      # Hono app: the 8 API routes
  router.tsx         # TanStack Router setup (exports getRouter)
  styles/app.css     # flat design system
server.mjs           # production Node server (serves dist/)
agent-service/       # Python FastAPI: watchdog + voice
data/cache/          # pre-scraped county JSON (offline, for the map)
```

## Scripts

| Script             | Does                                   |
| ------------------ | -------------------------------------- |
| `npm run dev`      | Vite dev server (HMR) on :3000         |
| `npm run build`    | Production build to `dist/`            |
| `npm start`        | Serve the build via `server.mjs`       |
| `npm run typecheck`| `tsc --noEmit`                         |

## Production build (no Docker)

```bash
npm run build
npm start                 # http://localhost:3000 (set PORT to change)
```

## Full stack with Docker (web + agent + Redis)

```bash
cp .env.example .env     
docker compose up --build
# web   -> http://localhost:3000
# agent -> http://localhost:8000
# redis -> localhost:6379
```

## Agent service

Runs independently — see [`agent-service/README.md`](agent-service/README.md).

