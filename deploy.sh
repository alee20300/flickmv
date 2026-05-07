#!/usr/bin/env bash
set -euo pipefail

cd ~/movieflixdash
git pull
./run.sh

echo "PUBLIC: $(curl -sI https://movieflixhd.cloud/ | head -n 1)"
