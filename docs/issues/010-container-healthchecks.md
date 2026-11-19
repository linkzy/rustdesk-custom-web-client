# R-16: log rotation and healthchecks in the repo compose files

**Labels:** `good first issue`, `area:deploy` · **Milestone:** v0.2.0 — Community-ready

**Context.** The demo stack (`deploy/docker-compose.demo.yml`) caps logs and
healthchecks both services; the compose files shipped for everyone else do neither,
so logs grow unbounded and a dead gateway still looks up.

**Do.** Copy the demo's blocks into both files, both services: `logging`
`json-file` with `max-size: 10m`, `max-file: 3`; a `healthcheck` per service (the
gateway's is `node -e "fetch('http://127.0.0.1:4000/config')…"`, the web's
`wget -q -O /dev/null http://127.0.0.1/config`).

**Where.** `docker-compose.yml`, `docker-compose.prod.yml`; reference
`deploy/docker-compose.demo.yml`.

**Accept.** Both files pass `docker compose config --quiet`; both services have
both blocks; `docker compose up -d` reaches `healthy`; no tags, ports or env change.

**Test without a host.** `docker compose up -d` with an unreachable relay still
starts both containers and `/config` answers; `docker compose ps` shows healthy.
