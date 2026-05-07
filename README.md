# MovieFlix Dashboard (Server-First)

This app now runs fully on the server (no Mac build/push/pull workflow required for runtime).

## Runtime Model

- Backend: `node server/app.js`
- Frontend build: `esbuild` via `scripts/build.mjs`
- Served assets: `dist/` (served by `server/app.js`)

## One Command Deploy (Recommended)

```bash
cd ~/movieflixdash
bash deploy.sh
```

`deploy.sh` does:
1. `git pull`
2. `./run.sh`
3. prints public health check

## Local Server Run Script

```bash
cd ~/movieflixdash
./run.sh
```

`run.sh` does:
1. Ensures Node/NPM path
2. Stops previous app process
3. Builds frontend (`npm run build`)
4. Starts backend in background on `PORT` (default `5002`)
5. Optional Telegram bot with `RUN_TELEGRAM=1`

## Manual Restart (If Needed)

```bash
cd ~/movieflixdash
pkill -f "/home/alee20300/movieflixdash/server/app.js" || true
nohup env PORT=5002 /home/alee20300/.nvm/versions/node/v24.14.0/bin/node /home/alee20300/movieflixdash/server/app.js > /tmp/movieflix-app.log 2>&1 </dev/null &
disown
```

## Health Checks

```bash
curl -sI http://127.0.0.1:5002/ | head -n 1
curl -sI https://movieflixhd.cloud/ | head -n 1
```

## Logs

```bash
tail -n 100 /tmp/movieflix-app.log
tail -n 100 /tmp/movieflix-error.log
tail -n 100 /tmp/cloudflared.log
```

## Cloudflare Tunnel

Start tunnel:

```bash
nohup ~/bin/cloudflared tunnel run movieflix > /tmp/cloudflared.log 2>&1 &
```

Check tunnel process:

```bash
pgrep -a -f "cloudflared tunnel run movieflix"
```

## Data Safety Rules

Runtime data lives on server and must not be overwritten by code deploys:

- `settings.json`
- `subscriptions.json`
- `registrations.json`
- `plans.json`
- `media-requests.json`
- `slips.json`
- `user-chats.json`
- `user-contacts.json`
- `user-tags.json`
- `unlimited-users.json`
- `telegram-state.json`
- `slips/`
- `emby-guide/`

Before major infra changes, create a backup tar under `backups/`.
