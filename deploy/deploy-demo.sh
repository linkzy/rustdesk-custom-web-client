#!/usr/bin/env bash
# Deploy or redeploy a demo instance of rclient on its host.
#
# Run this ON the demo host (it is not meant to run from a laptop):
#   cd <stack-dir> && ./deploy.sh
#
# It is deliberately narrow: it only ever touches the rclient-demo-* containers
# and network, so it cannot disturb anything else running on the machine.
#
# Required: a .env beside this file (copy deploy/demo.env.example).
# Optional: set DEMO_PUBLIC_URL to also run the public checks at the end, e.g.
#   DEMO_PUBLIC_URL=https://demo.example.com ./deploy.sh
set -euo pipefail

STACK_DIR="${STACK_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
WEB_PORT="${WEB_PORT:-8090}"
cd "$STACK_DIR"

if [ ! -f .env ]; then
  echo "ERROR: $STACK_DIR/.env is missing." >&2
  echo "Copy deploy/demo.env.example there and fill it in (never commit it)." >&2
  exit 1
fi

# Pull with an isolated Docker config so a stale credential in the host's own
# config cannot break a public-image pull.
export DOCKER_CONFIG="$STACK_DIR/.docker"
mkdir -p "$DOCKER_CONFIG"
[ -f "$DOCKER_CONFIG/config.json" ] || printf '{}' > "$DOCKER_CONFIG/config.json"

echo "==> Validating compose file"
docker compose config --quiet

echo "==> Pulling published images"
docker compose pull

echo "==> Starting the demo stack (only rclient-demo-* containers)"
docker compose up -d --remove-orphans

echo "==> Waiting for health"
for i in $(seq 1 30); do
  gw=$(docker inspect -f '{{.State.Health.Status}}' rclient-demo-gateway 2>/dev/null || echo none)
  web=$(docker inspect -f '{{.State.Health.Status}}' rclient-demo-web 2>/dev/null || echo none)
  [ "$gw" = healthy ] && [ "$web" = healthy ] && break
  sleep 2
done
echo "    gateway=$gw web=$web"

echo "==> Local checks (the origin, not the public URL)"
curl -fsS -m 10 "http://127.0.0.1:${WEB_PORT}/config" && echo
curl -fsS -m 10 -o /dev/null -w '    UI: %{http_code}\n' "http://127.0.0.1:${WEB_PORT}/"

if [ -n "${DEMO_PUBLIC_URL:-}" ]; then
  echo "==> Public checks ($DEMO_PUBLIC_URL)"
  # A CDN or a reverse proxy can answer instead of the origin, so this proves
  # reachability, not that the origin is healthy — the checks above do that.
  curl -fsS -m 20 -o /dev/null -w '    %{http_code}\n' "$DEMO_PUBLIC_URL/"
  curl -fsS -m 20 "$DEMO_PUBLIC_URL/config" && echo
else
  echo "==> Skipping public checks (set DEMO_PUBLIC_URL to enable them)"
fi
