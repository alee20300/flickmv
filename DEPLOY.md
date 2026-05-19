# Deployment Guide — FlickMV

FlickMV supports three deployment paths. Choose the one that fits your infrastructure.

| Option | Best for |
|--------|----------|
| [A. Vercel + Supabase Cloud](#option-a-vercel--supabase-cloud) | Quickest setup, managed hosting |
| [B. Coolify (Docker, self-hosted)](#option-b-coolify-self-hosted) | Full control, runs alongside Emby/Sonarr/Radarr |
| [C. Manual / bare-metal](#option-c-manual--bare-metal) | Custom server, no Docker |

---

## Prerequisites

- Node.js 22+
- A Supabase project (cloud or self-hosted)
- API access to Emby, Jellyseerr, Sonarr, and Radarr

---

## Environment Variables

Copy `.env.example` to `.env` (local) or configure the same keys in your hosting platform.

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `PORT` | Port for the Node proxy (default `3000`) |
| `EMBY_URL` | Base URL of your Emby server |
| `JELLYSEERR_URL` | Base URL of your Jellyseerr instance |
| `JELLYSEERR_API_KEY` | Jellyseerr API key |
| `SONARR_URL` | Base URL of your Sonarr instance |
| `SONARR_API_KEY` | Sonarr API key |
| `RADARR_URL` | Base URL of your Radarr instance |
| `RADARR_API_KEY` | Radarr API key |

> `VITE_*` variables are embedded at build time by Vite. All other variables are read at runtime by the Node proxy.

---

## Database Setup (run once)

1. Open your Supabase project → **SQL Editor**.
2. Paste and run the contents of `production-migration.sql`.

### Ongoing Migrations (CLI)

```bash
# Link to your project
supabase link --project-ref <project-ref>

# Push pending migrations
supabase db push
```

---

## Edge Functions

Deploy all Edge Functions to your Supabase project:

```bash
for fn in emby-auth register-otp approve-payment approve-media policy-sync fetch-trending status; do
  supabase functions deploy $fn --project-ref <project-ref>
done
```

---

## Option A: Vercel + Supabase Cloud

The frontend (SPA) deploys to Vercel; the Supabase cloud project handles auth, DB, and Edge Functions. The Node proxy is **not used** in this path — Vite's rewrites handle API routing through `vercel.json`.

### 1. Import project in Vercel

- Connect your GitHub repo.
- Framework preset: **Vite**
- Build command: `npx vite build`
- Output directory: `dist`

### 2. Add environment variables in Vercel

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=eyJh...
```

### 3. Deploy

Push to `main` → Vercel builds and deploys automatically.

### CI/CD via GitHub Actions

The workflow `.github/workflows/deploy-prod.yml` (production) and `deploy-dev.yml` (staging) automate DB migrations, Edge Function deploys, and the Vercel deploy on every push to `main` / `dev`.

Required GitHub repository secrets:

| Secret | Value |
|--------|-------|
| `SUPABASE_ACCESS_TOKEN` | Personal access token from Supabase dashboard |
| `SUPABASE_PROJECT_REF_PROD` | Production project ref (e.g. `efgh5678`) |
| `SUPABASE_PROJECT_REF_STAGING` | Staging project ref (e.g. `abcd1234`) |
| `VITE_SUPABASE_URL_PROD` | Production Supabase URL |
| `VITE_SUPABASE_ANON_KEY_PROD` | Production anon key |
| `VITE_SUPABASE_URL_STAGING` | Staging Supabase URL |
| `VITE_SUPABASE_ANON_KEY_STAGING` | Staging anon key |
| `VERCEL_TOKEN` | Vercel personal token |
| `VERCEL_ORG_ID` | Vercel org/team ID (`team_...`) |
| `VERCEL_PROJECT_ID` | Vercel project ID (`prj_...`) |

---

## Option B: Coolify (self-hosted)

Runs the full stack (frontend + Node proxy) as a single Docker container. Ideal when your media services (Emby, Sonarr, Radarr) are on the same network.

### 1. Add a new service in Coolify

- **New Service → Docker**
- Source: GitHub repo
- Dockerfile path: `Dockerfile`
- Port: `3000`

### 2. Set environment variables in Coolify

```
PORT=3000
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=eyJh...
EMBY_URL=https://your-emby-server
JELLYSEERR_URL=http://jellyseerr:5055
JELLYSEERR_API_KEY=xxx
SONARR_URL=http://sonarr:8989
SONARR_API_KEY=xxx
RADARR_URL=http://radarr:7878
RADARR_API_KEY=xxx
```

### 3. CI/CD via GitHub Actions

The workflow `.github/workflows/deploy-coolify.yml` builds the Docker image and pings the Coolify deploy webhook on every push to `main` or `dev`.

Required GitHub repository secrets:

| Secret | Value |
|--------|-------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |
| `COOLIFY_DEPLOY_WEBHOOK` | Webhook URL from Coolify service settings |

### 4. Manual Docker build

```bash
docker build -t flickmv .
docker run -p 3000:3000 --env-file .env flickmv
```

---

## Option C: Manual / Bare-metal

### 1. Install dependencies and build

```bash
npm ci
npx vite build    # outputs to dist/
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the environment before building.

### 2. Start the production server

```bash
node production-server.mjs
```

The server listens on `PORT` (default `3000`), serves `dist/` as static files, and proxies `/api/*` requests to the configured backend services.

### 3. Keep it running (systemd example)

```ini
[Unit]
Description=FlickMV
After=network.target

[Service]
WorkingDirectory=/opt/flickmv
ExecStart=/usr/bin/node production-server.mjs
Restart=on-failure
EnvironmentFile=/opt/flickmv/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now flickmv
```

---

## Local Development

```bash
cp .env.example .env   # fill in values
supabase start         # local Supabase (Docker required)
npm run dev            # Vite dev server with hot reload on http://localhost:5173
```

The Vite dev server proxies `/api/*` requests according to `vite.config.js` — no separate proxy process needed during development.
