# FlickMV

A media dashboard for managing subscriptions, content requests, and approvals — built on React, Supabase, and a lightweight Node proxy.

## Stack

- **Frontend** — React 19, React Router 7, Vite
- **Backend** — Supabase (auth, PostgreSQL, Edge Functions)
- **Proxy** — Node 22 (`production-server.mjs`) — passes API calls to Emby, Jellyseerr, Sonarr, Radarr

## Quick Start (local dev)

```bash
cp .env.example .env   # fill in Supabase + service URLs
supabase start         # start local Supabase (requires Docker)
npm install
npm run dev            # http://localhost:5173
```

## Deployment

See **[DEPLOY.md](./DEPLOY.md)** for full instructions covering:

- [Vercel + Supabase Cloud](./DEPLOY.md#option-a-vercel--supabase-cloud) (managed hosting)
- [Coolify self-hosted Docker](./DEPLOY.md#option-b-coolify-self-hosted)
- [Manual / bare-metal](./DEPLOY.md#option-c-manual--bare-metal)

## CI/CD

GitHub Actions workflows live in `.github/workflows/`:

| Workflow | Trigger | Action |
|----------|---------|--------|
| `ci.yml` | PR → `main` / `dev` | Lint + build check |
| `deploy-prod.yml` | Push → `main` | DB migrations + Edge Functions + Vercel prod deploy |
| `deploy-dev.yml` | Push → `dev` | DB migrations + Edge Functions + Vercel staging deploy |
| `deploy-coolify.yml` | Push → `main` / `dev` | Docker build + Coolify webhook |

## Scripts

```bash
npm run dev     # Vite dev server
npm run build   # Production build → dist/
npm run lint    # ESLint
npm start       # production-server.mjs (serves dist/ + proxies /api/*)
```
