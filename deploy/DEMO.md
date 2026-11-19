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

**Status: the UI works, but a real session does not complete today** — see
"Relay options" below. The demo defaults to **RustDesk's public servers**, so a
visitor only needs a machine ID and a password — no relay, no server key, no
setup. Anyone who runs their own RustDesk server can enter it under **Advanced
options** (HBBS host, HBBR host, server key); those fields work exactly as on any
other deployment, and pointing them at a relay that is up is the current
workaround.

### Limits

- **Public relay = slower**, even when it is up. Connections go through
  RustDesk's shared public servers, which are best-effort: expect extra latency
  and lower frame rates than a dedicated relay. The gateway always requests a
  relay (no direct P2P), so this is the normal path for every demo session.
- **No guarantees.** The demo can be restarted, redeployed, rate-limited or taken
  down at any time. It is a demo, not a service. Don't depend on it.
- **RustDesk's public servers must be up.** If RustDesk's public infrastructure
  has a bad day, the demo cannot connect — that is outside our control. At the
  time of writing its **relay** ports (`21117`/`21119`) were refused from this
  host, my machine and 8 external nodes, while its ID ports were open. See
  "Relay options" below for the evidence and the recommended fix.
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

## Relay options — investigation and recommendation

**Short answer:** as deployed, the demo can announce itself but **cannot complete
a real session**, and running our own `hbbr` on this host would not fix that for
a visitor whose RustDesk is on the public network. The only self-contained fix is
a demo-owned **hbbs + hbbr pair** *plus* the visitor pointing their RustDesk at
it — which changes the demo's "just a machine ID" promise. Details and numbers
below; nothing of this has been deployed.

### What I could and could not test

- **Could not** complete a full session: the only RustDesk I control is this
  machine, and it is configured for a **custom** relay, so it is not registered
  on RustDesk's public network and the public `hbbs` correctly reports it
  offline. I did not ask for, and did not use, any production credentials.
- **Could** verify every step up to the relay, and the relay itself, from
  several independent vantages.

### Evidence

Port reachability of `rs-ny.rustdesk.com`, the only public host that still
resolves (`rs-sg` and `rs-cn` have no A record):

| Port | Role | VPS | My machine | 8 external nodes |
| --- | --- | --- | --- | --- |
| 21116 | ID registration (TCP/UDP) | open | open | **6/8 open** |
| 21118 | ID server for web clients | open | open | **6/8 open** |
| 21117 | **relay** (TCP) | refused | refused | **0/8 open** |
| 21119 | **relay** for web clients | refused | refused | **0/8 open** |

Same result from inside the running demo container
(`rclient-demo-gateway`): `21118 → OPEN`, `21119 → ECONNREFUSED`. Over HTTPS,
`https://rs-ny.rustdesk.com/ws/id` → `101 Switching Protocols` while
`/ws/relay` → `404`, and `:21119` does not even complete a TLS handshake.

So the ID half of RustDesk's public infrastructure works; the **relay** half is
down (or withdrawn). That is outside our control and also breaks RustDesk's own
<https://rustdesk.com/web/>.

### Why an own `hbbr` on this host would not be enough

In RustDesk's OSS server (`src/rendezvous_server.rs`), **`hbbs` chooses the
relay** — `get_relay_server()` returns a host from the relay list that `hbbs`
itself was configured with — and it hands the *same* relay to both peers. The
two peers must meet on the same `hbbr` under the same UUID. Our gateway could be
forced onto a relay of ours via `HBBR_HOST`, but the visitor's RustDesk is told
by the **public** `hbbs` to use the public relay. They would never meet.

Similarly, a demo-owned `hbbs` knows nothing about an ID that registered on the
public server: it would answer "device is offline". For a visitor's machine to
be findable, that machine must register on **our** `hbbs`.

Finally, `rclient` always relays: `gateway/src/rendezvous.ts` sets
`force_relay: true`, and `relay.ts` only ever opens a relay connection. There is
no direct/P2P path to fall back on.

### Options

| # | Option | Works for a public-network visitor? | Cost / caveats |
| --- | --- | --- | --- |
| A | Keep public defaults, wait for RustDesk's relay to return | Eventually, not today | Free. Demo is **degraded now**; nothing we can do. |
| B | Own `hbbr` only, gateway points at it | **No** | Useless — visitor stays on the public relay. Do not do this. |
| C | Own `hbbs` + `hbbr` pair, visitor points RustDesk at the demo | **Yes**, reliably | ~5 MB RAM, 13 MB image, 5 ports; **visitor must be configured** (see below). |
| D | Change the gateway to allow direct connections (no force_relay) | Sometimes | Code change in `gateway/` (not mine); fails behind double NAT; still no relay when hole punching fails. |

### Resource cost of option C (measured on this host)

I started both images in a sealed container (`--network none`, no published
ports) to measure, then removed them — this was a measurement, not a deployment:

- `rustdesk/rustdesk-server:latest` — **13.1 MB** on disk (already pulled).
- `hbbs` 1.1.16 RSS **2.7 MB**, `hbbr` **1.5 MB** → **~5 MB** total.
- Ports `21115`, `21116` (TCP **and** UDP), `21117`, `21118`, `21119` are all
  **free** on the host and **accept inbound** (I bound each for 30 s and reached
  it from an external machine; nothing was installed and the test listener is
  gone).
- Host has ~3.0 GB RAM available and 352 GB free disk, so this is negligible.

The compose delta is one service pair alongside the demo, with **host
networking** (RustDesk requires it so peers see real IPs), its own data volume
and its own freshly generated key:

**A separate DNS name is required.** `rclient-demo.linkzy.dev` is proxied
through Cloudflare (orange cloud), so it only carries HTTP(S) on 80/443 — raw
RustDesk traffic on 21116/21117 does not pass through it (verified: 21116 on the
hostname is refused). Option C needs a **DNS-only (grey cloud)** record, e.g.
`rd-demo.linkzy.dev → <VPS IP>`, and RustDesk clients then use that name:

```yaml
  hbbs:
    image: rustdesk/rustdesk-server:latest
    command: hbbs -r rd-demo.linkzy.dev:21117
    network_mode: host
    volumes: ["./relay-data:/root"]
    restart: unless-stopped
    mem_limit: 64m
    logging: { driver: json-file, options: { max-size: "10m", max-file: "3" } }

  hbbr:
    image: rustdesk/rustdesk-server:latest
    command: hbbr
    network_mode: host
    volumes: ["./relay-data:/root"]
    restart: unless-stopped
    mem_limit: 64m
    logging: { driver: json-file, options: { max-size: "10m", max-file: "3" } }
```

`hbbs` prints the new public key on first run (`docker logs … | grep "Key:"`);
that key goes in `SERVER_KEY`, in place of the public one. Never reuse the
owner's key.

**The catch:** with option C the demo is only useful to someone who sets
**ID Server = `rd-demo.linkzy.dev`** and **Key = the demo's key** in their
RustDesk (or runs a RustDesk built with that config). That is no longer "type a
machine ID and go". It is honest and reliable, but it is a different demo.

### Recommendation

1. **Now:** keep the public defaults and label the demo as **degraded /
   best-effort** rather than advertising a working session. That is what it is
   today, and it costs nothing.
2. **If a reliably-working demo is wanted:** take option C, and document the
   two-step setup for the visitor (install RustDesk → set ID Server + Key) on the
   demo landing page. Verify with a real peer before advertising it.
3. **Do not** deploy an `hbbr` alone (option B): it looks like a fix and is not.
4. Tell RustDesk users the demo's status honestly in the README (T15) — do not
   claim "connect in one click" while the public relay is down.

Re-test before acting — this may be a transient RustDesk outage:

```sh
for p in 21116 21118 21117 21119; do
  timeout 5 bash -c "exec 3<>/dev/tcp/rs-ny.rustdesk.com/$p" 2>/dev/null \
    && echo "$p open" || echo "$p refused"
done
```

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
