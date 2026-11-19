# R-19: memory limits in the repo compose files

**Labels:** `help wanted`, `area:deploy` · **Milestone:** v0.2.0 — Community-ready

**Context.** The demo caps `gateway` at 192 MB and `web` at 96 MB. The shipped
compose files have no limits, so a runaway session grows until a small VPS swaps
and everything else on it suffers.

**Do.** Add to both services in both files:
`mem_limit: 192m` + `memswap_limit: 192m` (gateway), `mem_limit: 96m` +
`memswap_limit: 96m` (web). Plain-Compose keys, no Swarm needed — the demo uses
the same.

**Where.** `docker-compose.yml`, `docker-compose.prod.yml`; reference
`deploy/docker-compose.demo.yml`.

**Accept.** Both files pass `docker compose config --quiet`; both services have
both keys; values match the demo or the PR explains the difference.

**Test without a host.** `docker compose up -d`, then
`docker inspect rclient-gateway --format '{{.HostConfig.Memory}}'` → `201326592`.

**Note.** Relay containers are outside this repo; their limits stay open in R-19.
