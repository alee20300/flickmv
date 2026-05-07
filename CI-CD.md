# CI/CD — FlickMV (Coolify)

## Architecture

```
GitHub Push → Docker Build → Coolify Deploy

Production:
  ├── Static SPA (dist/)     → Served by Node proxy
  ├── Node Proxy (port 3000) → Emby/Seer/Sonarr/Radarr passthrough
  ├── Supabase (self-hosted) → DB + Auth + Storage + Edge Functions
  └── External Services      → Emby, Sonarr, Radarr, MsgOwl
```

## Files

| File | Purpose |
|---|---|
| `Dockerfile` | Multi-stage: vite build + Node proxy |
| `production-server.mjs` | Lite proxy (200 lines, replaces server/app.js) |
| `.env.production` | Production env vars |
| `.github/workflows/deploy-coolify.yml` | CI/CD workflow |

## Coolify Setup

### 1. Add as Docker Service

In Coolify:
- New Service → Docker
- Build from GitHub repo
- Dockerfile path: `/Dockerfile`
- Port: `3000`

### 2. Environment Variables (in Coolify)

```
PORT=3000
EMBY_URL=https://movieflixhd.cloud
SONARR_URL=http://sonarr:8989
SONARR_API_KEY=xxx
RADARR_URL=http://radarr:7878
RADARR_API_KEY=xxx
```

### 3. Database Migration

Open Supabase Studio SQL Editor and run `production-migration.sql` once.

### 4. Edge Functions

Deploy manually or via script:

```bash
for fn in emby-auth register-otp approve-payment approve-media policy-sync fetch-trending status; do
  supabase functions deploy $fn --project-ref local
done
```

## Local Development

```bash
npm run dev          # Vite dev server (hot reload)
supabase start       # Local Supabase
```

## Production Commands

```bash
npm run build        # Vite production build
node production-server.mjs  # Start production server
docker build -t flickmv .  # Docker build
```
