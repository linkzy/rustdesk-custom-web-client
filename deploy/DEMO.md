# The public demo

A separate, public instance of rclient where anyone can try the web client
against their own machine, without needing a relay of their own or access to the
owner's.

- **URL:** <https://rclient-demo.linkzy.dev>
- **Host:** the Contabo VPS, reached through the Symbio connection `VPS - Contabo`
  (the address is kept out of the repo on purpose; ask the coordinator).
- **Status:** separate from production — the owner's private instance is
  `rclient.linkzy.dev` on a different VPS and is not touched by anything here
  (rule PROJ-003).

> **Docs note:** per the T18 brief this write-up lives in `deploy/DEMO.md`, not in
> `docs/`, because `docs/` is owned by another helper right now. It is meant to be
> folded into `docs/` later.

## Host snapshot (taken before any change)

Recorded before anything was created, so the demo's footprint can be judged
against what was already there:

| Item | Found |
| --- | --- |
| OS | Ubuntu 20.04.6 LTS, kernel 5.4 |
| Docker / Compose | Docker 27.3.1, Compose v2.29.7 |
| Running containers | 24 (immich ×4, medialib, endurain + postgres, comunick, vgq/igq/vogq, kids-hub, narrator-tts, caption-burner, n8n, filebrowser, jellyfin, linkzyblog ×3, portainer, watchtower, redis) |
| Memory | 5.8 GB total, ~3.0 GB available, 31 GB swap |
| Disk | 588 GB total, 353 GB free (37% used) |
| cloudflared | `/usr/local/bin/cloudflared` 2026.10.1, `cloudflared.service` active + enabled, tunnel `kids-games` (`5a76ddc8-…`) serving 9 hostnames from `/etc/cloudflared/config.yml` |
| Second tunnel | `rclient` (`56ddaaee-…`) existed, owned by the private production instance — left untouched |
| Free local ports | 8090–8092 unused |
| DNS | `rclient-demo.linkzy.dev` had no record |

Nothing above was modified. The demo is additive: its own network, its own two
containers, its own tunnel and unit.

## What a visitor gets

Type a RustDesk machine ID and its password → the remote desktop opens in the
browser. Nothing to install.

The demo defaults to **RustDesk's public relay servers**, so a visitor only needs
a machine ID and a password — no relay, no server key, no setup. Anyone who runs
their own RustDesk server can enter it under **Advanced options** (HBBS host,
HBBR host, server key); those fields still work exactly as on any other
deployment.

### Limits

- **Public relay = slower.** Connections go through RustDesk's shared public
  servers, which are best-effort: expect extra latency and lower frame rates than
  a dedicated relay. The gateway always requests a relay (no direct P2P), so this
  is the normal path for every demo session.
- **No guarantees.** The demo can be restarted, redeployed, rate-limited or taken
  down at any time. It is a demo, not a service. Don't depend on it.
- **RustDesk's public servers must be up.** If RustDesk's public infrastructure
  has a bad day, the demo cannot connect. That is outside our control. (At the
  time of writing, RustDesk's public *relay* port `21119`/`21117` appeared
  unreachable from this host and from several independent external nodes, while
  its ID port `21118` was open. See "Known caveat" below.)
- **No captcha, no accounts, no storage.** The gateway keeps no session data
  beyond the life of a connection, and the demo has no database.
- **One visitor per WebSocket.** A browser tab holds one session; the gateway
  drops the previous session when a new connect arrives on the same socket.

## Architecture

```
visitor ──HTTPS──> Cloudflare edge
                      │
                      ▼
        rclient-demo-tunnel.service   (cloudflared, own tunnel, own config)
                      │  http://localhost:8090
                      ▼
        rclient-demo-web   (nginx: UI + /config + /ws proxy, 127.0.0.1:8090)
                      │  http://gateway:4000   (private compose network)
                      ▼
        rclient-demo-gateway   (Node gateway, no published port)
                      │  ws://rs-ny.rustdesk.com:21118 / :21119
                      ▼
        RustDesk public servers  (ID + relay)
```

Both containers, the network, the tunnel and the systemd unit are named
`rclient-demo*` so they can never be confused with the owner's services.

## Where things live (on the VPS)

| What | Path |
| --- | --- |
| Compose file | `/home/demo/docker-compose.yml` (same as `deploy/docker-compose.demo.yml`) |
| Environment | `/home/demo/.env` (mode `600`, never committed) |
| Anonymous pull config | `/home/demo/.docker/config.json` |
| Tunnel config | `/etc/cloudflared/rclient-demo.yml` |
| Tunnel credentials | `/root/.cloudflared/cc58c549-6980-404d-b653-9bc9d8ca4613.json` (mode `400`) |
| Tunnel unit | `/etc/systemd/system/rclient-demo-tunnel.service` |

The three small files that belong in the repo are under `deploy/`:

- `deploy/docker-compose.demo.yml` — the stack
- `deploy/demo.env.example` — the `.env` template (placeholders only)
- `deploy/cloudflared/` — the tunnel config, its unit, and how to manage it

## Deploying from scratch

1. **Create the directory and files**

   ```sh
   mkdir -p /home/demo && cd /home/demo
   # copy deploy/docker-compose.demo.yml to ./docker-compose.yml
   # copy deploy/demo.env.example to ./.env  and review every value
   chmod 600 .env && chmod 700 /home/demo/.docker
   ```

2. **Check the compose file and start the stack**

   ```sh
   cd /home/demo
   docker compose config --quiet
   DOCKER_CONFIG=/home/demo/.docker docker compose up -d
   ```

3. **Check it locally** (must answer on localhost only)

   ```sh
   curl -s http://127.0.0.1:8090/config
   # {"captchaEnabled":false,"hcaptchaSiteKey":""}
   ```

4. **Create the tunnel** (only if it does not exist yet)

   ```sh
   export TUNNEL_ORIGIN_CERT=/root/.cloudflared/cert.pem
   cloudflared tunnel create rclient-demo
   cloudflared tunnel route dns rclient-demo rclient-demo.linkzy.dev
   ```

   Put the tunnel ID and the credentials path into
   `/etc/cloudflared/rclient-demo.yml`, install the unit from
   `deploy/cloudflared/rclient-demo-tunnel.service`, then:

   ```sh
   systemctl daemon-reload
   systemctl enable --now rclient-demo-tunnel.service
   ```

5. **Verify from outside**

   ```sh
   curl -sI https://rclient-demo.linkzy.dev/ | head -3      # HTTP/2 200
   curl -s  https://rclient-demo.linkzy.dev/config          # captchaEnabled:false
   ```

## Redeploying (new images)

`watchtower` runs on this host, but the demo containers carry
`com.centurylinklabs.watchtower.enable=false`, so it does **not** manage them and
will not restart the demo mid-session. A redeploy is explicit:

```sh
cd /home/demo
./deploy.sh          # from deploy/deploy-demo.sh, kept in this directory
```

or by hand:

```sh
cd /home/demo
export DOCKER_CONFIG=/home/demo/.docker
docker compose pull
docker compose up -d
docker compose ps
```

Rollback: pin the image tags in `docker-compose.yml` to the previous tag and run
`docker compose up -d` again. The published images are tagged `latest` plus every
commit SHA (`ghcr.io/linkzy/rclient-web:<sha>`), so a known-good commit is always
available.

## Operating it

```sh
cd /home/demo
docker compose ps
docker compose logs -f --tail 100 gateway
systemctl status rclient-demo-tunnel.service --no-pager
```

Stop only the demo:

```sh
cd /home/demo && docker compose down
```

**Never** `docker stop`/`docker restart` a container that is not named
`rclient-demo-*`, and never restart `cloudflared.service` — that is the owner's
tunnel and it serves the rest of the host.

## Stability settings (R-16 / R-19)

Applied to both demo containers so the demo cannot destabilise the host:

| Setting | gateway | web | Why |
| --- | --- | --- | --- |
| `mem_limit` | 192 MB | 96 MB | A runaway session OOM-kills only the demo container and it restarts cleanly (R-19). |
| `restart` | `unless-stopped` | `unless-stopped` | Comes back after a crash or host reboot. |
| watchtower | disabled | disabled | `com.centurylinklabs.watchtower.enable=false` — the host's auto-updater must not restart a live demo session. |
| log driver | `json-file`, `10m` × `3` | `json-file`, `10m` × `3` | Hard cap of 30 MB of logs per container (R-16). |
| healthcheck | `GET /config` every 30 s | `GET /config` every 30 s | `web` waits for a healthy `gateway`; a dead gateway is visible in `docker ps`. |

The host has 5.8 GB RAM (~3.0 GB available) and 353 GB free disk, so the demo's
~300 MB ceiling is a small, bounded slice.

## Known caveat: RustDesk's public relay ports

The demo points at RustDesk's public servers (`rs-ny.rustdesk.com`): ID server on
WebSocket `21118`, relay on `21119`. During the T18 deployment:

- `21118` accepted WebSocket upgrades from the VPS and from external nodes, and
  the deployed gateway completed a rendezvous against it (an unknown machine ID
  got the correct "target device is offline" answer — the path works).
- `21117` and `21119` (the relay ports) were **refused** from the VPS and from
  four independent external nodes, while `21118` stayed open.

So the ID/routing half of the public infrastructure works, but the public relay
half did not appear reachable at deployment time. This matters because the
gateway currently always asks for a relay (`force_relay: true` in
`gateway/src/rendezvous.ts`), so a session cannot fall back to a direct
connection. If a visitor reports "connected, waiting for image" or a relay
timeout, this is the first thing to check.

What to do if it persists:

1. Re-test `21119` from a neutral vantage point.
2. Point the demo at any working public or self-hosted relay by editing
   `HBBS_HOST`/`HBBR_HOST`/`SERVER_KEY` in `/home/demo/.env` and running
   `docker compose up -d`. **Generate a fresh key for a demo-owned relay — never
   copy the owner's key.**
3. Note that leaving `HBBR_HOST` empty makes the gateway fall back to the relay
   host hbbs returns; setting it explicitly (as the demo does) overrides that.
   Changing it is a one-line `.env` edit and a restart of the demo stack only.

## Security notes

- The web UI is bound to `127.0.0.1` and the gateway publishes no port. The only
  way in is the demo tunnel. `curl http://<vps-ip>:8090/` must time out.
- `.env` (mode 600) and the tunnel credentials (mode 400) hold secrets; they are
  not in the repo and must not be pasted into messages or docs.
- The demo uses RustDesk's published *public* server key, which is public
  information, not a secret — and not the owner's key. `deploy/demo.env.example`
  carries it as a documented default; it grants nothing beyond using RustDesk's
  shared servers.
- Only the demo tunnel's ingress rule exists for this subdomain; all other
  hostnames on the host stay on the owner's own tunnel.
