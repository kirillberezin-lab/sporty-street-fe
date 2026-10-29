#!/usr/bin/env bash
# Copies the backend's public media (players, avatars, league art + credits) into public/media and
# its simulated community seed into src/mock/community-seed.js, for the static build and the mock.
# Usage: npm run sync-media [path to the backend checkout]   (default ../sporty-street)
set -euo pipefail
cd "$(dirname "$0")/.."
BE="${1:-../sporty-street}"
MEDIA="$BE/src/main/resources/static/media"
SEED="$BE/src/main/resources/seed/community.json"
[ -d "$MEDIA" ] || { echo "No media at $MEDIA (pass the backend folder as an argument)"; exit 1; }
mkdir -p public/media
for d in players avatars leagues; do
  [ -d "$MEDIA/$d" ] || continue
  rm -rf "public/media/$d"
  cp -R "$MEDIA/$d" "public/media/$d"
  echo "public/media/$d: $(ls "public/media/$d" | wc -l | tr -d ' ') files"
done
if [ -f "$SEED" ]; then
  { echo "// Generated from the backend seed (src/main/resources/seed/community.json) by scripts/sync-media.sh."
    echo "// Simulated social content: leagues, rivalries, banter, managers. Do not edit by hand."
    printf "export default "; cat "$SEED"; } > src/mock/community-seed.js
  echo "src/mock/community-seed.js updated"
fi
