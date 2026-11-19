# R-25: reverse-proxy examples (Caddy, Traefik, Nginx Proxy Manager)

**Labels:** `good first issue`, `area:docs`, `documentation` · **Milestone:** v0.2.0 — Community-ready

**Context.** The README shows a full Cloudflare Tunnel and a three-line Caddy
snippet. Traefik and Nginx Proxy Manager users need the WebSocket upgrade handled
correctly; get it wrong and `/ws` connects then closes at once, which reads as a
gateway bug.

**Do.** One page with complete configs for proxying the `web` container (which
already proxies `/ws` and `/config` internally — only the UI port needs TLS):
Caddy, Traefik (labels and file provider), Nginx Proxy Manager (UI steps), and a
plain-nginx alternative to the repo's own `web/nginx.conf`. Each with TLS, the
`Proxy` header, and the long-session timeout (`proxy_read_timeout 3600s`).

**Where.** New `docs/deployment/REVERSE-PROXY.md`; link from `docs/README.md` and
the README's Step 4.

**Accept.** Each example works after changing only the hostname; all point at port
80 of `web`, never 4000; no real domains or certificates; explains why exposing the
gateway is wrong.

**Test without a host.** `docker compose up -d`, load the UI through the proxy, and
check DevTools → Network → `ws` shows `101 Switching Protocols` (the gateway will
then close it without a relay — the upgrade is the test).
