#!/bin/bash
set -e
DB="supabase-db-blt021qyd19fli8m4lx3ig03"
EF="supabase-edge-functions-blt021qyd19fli8m4lx3ig03"
MIGRATION="https://raw.githubusercontent.com/alee20300/flickmv/main/production-migration.sql"
REPO_DIR="/tmp/flickmv-functions"
FUNCTIONS_DIR="/data/coolify/services/blt021qyd19fli8m4lx3ig03/volumes/functions"

echo "=== 1. Database Migration ==="
docker exec $DB psql -U postgres -d postgres -c "$(curl -fsSL $MIGRATION)"
echo "Migration complete."

echo "=== 2. Deploy Edge Functions ==="
rm -rf $REPO_DIR
git clone -q --depth 1 https://github.com/alee20300/flickmv.git $REPO_DIR
mkdir -p $FUNCTIONS_DIR/_shared
cp $REPO_DIR/supabase/functions/_shared/index.ts $FUNCTIONS_DIR/_shared/

for fn in emby-auth register-otp approve-payment approve-media policy-sync fetch-trending status; do
  echo "  Deploying $fn..."
  mkdir -p $FUNCTIONS_DIR/$fn
  cp $REPO_DIR/supabase/functions/$fn/index.ts $FUNCTIONS_DIR/$fn/
done

docker restart $EF
echo "Functions deployed."

echo "=== 3. Populate Trending ==="
sleep 10
curl -fsS -X POST "http://supabasekong-blt021qyd19fli8m4lx3ig03.72.62.121.172.sslip.io/functions/v1/fetch-trending" \
  -H "Content-Type: application/json" -d '{}'

echo ""
echo "=== DONE ==="
echo "App: http://ujvx8230xm9rrfdm4ug63eeg.72.62.121.172.sslip.io"
