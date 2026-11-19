#!/usr/bin/env bash
# Deploy or redeploy the rclient public demo on the Contabo VPS.
#
# Run this ON the VPS (it is not meant to run from a laptop):
#   cd /home/demo && ./deploy.sh
#
# It is deliberately narrow: it only ever touches the rclient-demo-* containers,
# the rclient-demo network and rclient-demo-tunnel.service. It never stops,
# restarts or removes a container it did not create, and it never touches the
# owner's cloudflared tunnel.
set -euo pipefail

STACK_DIR="${STACK_DIR:-/home/demo}"
cd "$STACK_DIR"

# Pull anonymously with an isolated Docker config: the host's /root/.docker
# config holds an expired GHCR credential, and the images are public anyway.
export DOCKER_CONFIG="$STACK_DIR/.docker"
mkdir -p "$DOCKER_CONFIG"
[ -f "$DOCKER_CONFIG/config.json" ] || printf '{}' > "$DOCKER_CONFIG/config.json"

if [ ! -f .env ]; then
  echo "ERROR: $STACK_DIR/.env is missing." >&2
  echo "Copy deploy/demo.env.example there and fill it in (never commit it)." >&2
  exit 1
fi

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

echo "==> Local checks"
curl -fsS -m 10 http://127.0.0.1:"${WEB_PORT:-8090}/config" && echo
curl -fsS -m 10 -o /dev/null -w '    UI: %{http_code}\n' http://127.0.0.1:"${WEB_PORT:-8090}/"

echo "==> Demo tunnel"
systemctl is-active --quiet rclient-demo-tunnel.service \
  || echo "    WARNING: rclient-demo-tunnel.service is not active"

echo "==> Public checks"
curl -fsS -m 20 -o /dev/null -w '    https://rclient-demo.linkzy.dev/ -> %{http_code}\n' https://rclient-demo.linkzy.dev/
curl -fsS -m 20 https://rclient-demo.linkzy.dev/config && echo

echo "==> Untouched: the host's other containers"
docker ps --format '{{.Names}}' | grep -v '^rclient-demo' | wc -l | xargs echo "    running non-demo containers:"
