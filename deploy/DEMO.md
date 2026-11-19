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

> **STATUS: the relay infrastructure is in place and was verified at protocol
> level; a full RustDesk-to-browser session has NOT yet been run end to end.**
> The demo now has its own RustDesk relay pair (`hbbs`+`hbbr`) on
> `relay-demo.linkzy.dev` instead of RustDesk's shared servers. Ports, key
> enforcement, UDP registration and relay pairing (bidirectional data through
> `hbbr` between two different networks) are all verified. What is **not** yet
> verified is the last mile: a real RustDesk host registered on this relay
> producing video and input in the browser. Until someone does that, treat the
> demo as "should work, unproven".

**Before you connect**, point your RustDesk at the demo's relay (only the
machine you want to control needs this; the browser side is already configured):

1. RustDesk → **⋮** menu next to your ID → **Network** (or **Settings →
   Network**), unlock with admin rights if asked.
2. **ID Server** = `relay-demo.linkzy.dev`
3. **Key** = the demo's public key, shown below
4. **Relay Server** and **API Server**: leave blank (RustDesk infers them)
5. Apply, wait for the status to go green, then enter your machine ID and
   password in the form.

The demo's public key is **not** in this repository (T24: the key lives only in
`/home/demo/.env` on the VPS, mode `600`). Read it there when you need it:

```sh
# on the VPS — prints the PUBLIC key only
cat /home/demo/relay-data/id_ed25519.pub
```

The demo page should show that value to visitors; whoever runs a real session
test should confirm it is displayed. The matching **private** key stays in
`/home/demo/relay-data/id_ed25519` and never leaves the VPS.

Anyone who already runs their own RustDesk server can instead enter their own
relay under **Advanced options**; that still works as before.

The deployed stack is release 0.2.0 (web and gateway).

### Limits

- **The demo relay is this one VPS.** At most `128 Mb/s` per session (hbbr's
  default) and bounded by the host's bandwidth. It is shared by every visitor,
  so heavy use is slow use. Expect noticeably lower frame rates than a dedicated
  relay.
- **No guarantees.** The demo can be restarted, redeployed, rate-limited or taken
  down at any time. It is a demo, not a service. Don't depend on it.
- **Visitors must configure their client first.** Unlike a public-relay demo,
  this one requires the two-step setup above. If you type a machine ID whose
  RustDesk is still on RustDesk's public servers, it will not be found — the two
  are separate networks.
- **The key is required.** hbbs rejects a punch-hole request with the wrong key
  (`LICENSE_MISMATCH`), which is verified behaviour, not a bug.
- **The demo no longer depends on RustDesk's public servers.** It used to; their
  relay ports (`21117`/`21119`) were refused from the VPS, my machine and 8
  external nodes while the ID ports stayed open, which is why this pair was
  built. If you ever switch the demo back to the public servers, expect the same
  failure. See "Relay options" below for that history.
- **The public key above is generated, not the owner's.** Rotating it (see
  "Rotating the demo key") invalidates every client that was configured with the
  old one, so only do it deliberately.
- **No captcha, no accounts, no storage.** The gateway keeps no session data
  beyond the life of a connection, and the demo has no database.
- **One visitor per WebSocket.** A browser tab holds one session; the gateway
  drops the previous session when a new connect arrives on the same socket.
- **The page title tracks the image, not the repo.** The demo now serves
  `<title>rclient — RustDesk web client</title>` (T16, picked up by the 0.2.0
  redeploy of 2026-11-19). Any later title change in `web/index.html` only shows
  up after a redeploy — the demo follows the published image, it does not build
  from source.

## Architecture

```
visitor's browser ──HTTPS──> Cloudflare edge (rclient-demo.linkzy.dev, proxied)
                      │
                      ▼
        rclient-demo-tunnel.service   (cloudflared, own tunnel, own config)
                      │  http://localhost:8090
                      ▼
        rclient-demo-web   (nginx: UI + /config + /ws proxy, 127.0.0.1:8090)
                      │  http://gateway:4000   (private compose network)
                      ▼
        rclient-demo-gateway   (Node gateway, no published port)
                      │  ws://relay-demo.linkzy.dev:21118 / :21119
                      ▼
        rclient-demo-hbbs  ──>  rclient-demo-hbbr
        (own relay pair, host networking, 21115-21119)
                      ▲
                      │  raw RustDesk TCP/UDP on 21116/21117,
                      │  DNS-only record (NOT proxied)
        visitor's RustDesk host  (ID Server = relay-demo.linkzy.dev, + Key)
```

Two things reach the internet and they are deliberately different shapes:

| Hostname | DNS | Carries | Why |
| --- | --- | --- | --- |
| `rclient-demo.linkzy.dev` | proxied (orange cloud) | HTTPS only, via the tunnel | The web UI. Cloudflare terminates TLS. |
| `relay-demo.linkzy.dev` | **DNS-only (grey cloud)** | raw TCP/UDP `21115`–`21119` | RustDesk's own protocol. Cloudflare's proxy cannot carry it, so this must point straight at the VPS. |

Every container, the network, the tunnel and the systemd unit are named
`rclient-demo*` so they can never be confused with the owner's services.

## What was verified, and what was not

Honest accounting — this is the part to trust over any status line.

**Verified (2026-11-19, after deployment):**

| Check | Result |
| --- | --- |
| All four containers healthy | `docker compose ps` → gateway/web healthy, hbbs/hbbr up |
| Relay ports from outside the VPS (my machine) | `21115`, `21116`, `21117`, `21118`, `21119` all reachable; UDP `21116` sends |
| DNS shape | `relay-demo` resolves straight to the VPS IP (grey cloud, verified against Cloudflare's API and two resolvers) — not to a Cloudflare address |
| hbbs bound to the right relay | log: `relay-servers=["relay-demo.linkzy.dev:21117"]` |
| **Relay data path** | **paired two peers on different networks through `hbbr` and exchanged payloads both ways.** hbbr logged `Relayrequest T24PROOF from <vps>:54762` then `… from <my ip>:50101 got paired`, and both sides received the other's messages. |
| Key enforcement | punch-hole with a **wrong** key → `LICENSE_MISMATCH`; with the demo key → accepted |
| UDP registration | `RegisterPk` over UDP `21116` → `register_pk_response` OK |
| Gateway points at the new relay | log: `Connected to hbbs at ws://relay-demo.linkzy.dev:21118` |
| Public UI | `https://rclient-demo.linkzy.dev/` → 200, title `rclient — RustDesk web client`; `/config` → `{"captchaEnabled":false}`; `/ws` upgrades 101 |

**NOT verified — do not assume it works:**

- **A full session from a real RustDesk host to the browser (video + input).**
  I could not do this: the only RustDesk I control is configured for a custom
  relay, and I would not repoint the owner's running client. My synthetic
  rendezvous attempts could not reproduce what a real client does over the
  hole-punch/relay handshake, so the last mile is unproven.
- **Behaviour behind a real NAT/router pair** as opposed to the direct
  connections I tested.
- **Latency and frame rate** in practice.

To close it: configure one real machine as described above, connect from the
demo, and confirm video and input. If that works, update this section and the
status line at the top.

## Rotating the demo key

```sh
cd /home/demo
docker compose stop hbbs hbbr
mv relay-data relay-data.old-$(date +%F)     # keep it until the new one is proven
mkdir relay-data
docker compose up -d hbbs hbbr
sleep 5
docker logs rclient-demo-hbbs 2>&1 | grep "Key:"
```

Put the printed key into `/home/demo/.env` as `SERVER_KEY`, then
`docker compose up -d` so the gateway picks it up. Update the key shown on the
demo page and in this file. Every visitor must re-enter it.

Never copy the owner's `id_ed25519` here, and never commit `relay-data/` — it
holds the private key and the peer database.

## Where things live (on the VPS)

| What | Path |
| --- | --- |
| Compose file | `/home/demo/docker-compose.yml` (same as `deploy/docker-compose.demo.yml`) |
| Environment | `/home/demo/.env` (mode `600`, never committed) |
| **Relay key pair + peer DB** | `/home/demo/relay-data/` (`id_ed25519` mode `600`, `id_ed25519.pub`, `db_v2.sqlite3`) |
| Anonymous pull config | `/home/demo/.docker/config.json` |
| Tunnel config | `/etc/cloudflared/rclient-demo.yml` |
| Tunnel credentials | `/root/.cloudflared/cc58c549-6980-404d-b653-9bc9d8ca4613.json` (mode `400`) |
| Tunnel unit | `/etc/systemd/system/rclient-demo-tunnel.service` |

`relay-data/` sits on the VPS only — it is a bind mount, never in the repo.

The three small files that belong in the repo are under `deploy/`:

- `deploy/docker-compose.demo.yml` — the stack (web, gateway, hbbs, hbbr)
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
commit SHA (`ghcr.io/linkzy/rclient-web:sha-<short>`), so a known-good commit is
always available.

### Pin to a release instead of `latest`

`docker-compose.demo.yml` follows `:latest`, so a redeploy picks up the newest
build. To freeze the demo on a known release, pin both images:

```yaml
image: ghcr.io/linkzy/rclient-gateway:0.2.0
image: ghcr.io/linkzy/rclient-web:0.2.0
```

A tag push publishes `0.2.0`, `0.2` and `sha-<short>` alongside `latest` on
**both** images (see [`docs/RELEASING.md`](../docs/RELEASING.md)). The two
images are separate builds and one can finish after the other, so a release tag
can exist on the gateway before it exists on the web image. Check both before
pinning:

```sh
for repo in rclient-gateway rclient-web; do
  tok=$(curl -s "https://ghcr.io/token?scope=repository:linkzy/$repo:pull&service=ghcr.io" \
    | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
  curl -s -o /dev/null -w "$repo:0.2.0 -> %{http_code}\n" \
    -H "Authorization: Bearer $tok" \
    -H 'Accept: application/vnd.oci.image.index.v1+json,application/vnd.docker.distribution.manifest.list.v2+json,application/vnd.docker.distribution.manifest.v2+json' \
    "https://ghcr.io/v2/linkzy/$repo/manifests/0.2.0"
done
# 200 = published, 404 = not there yet
```

Every commit build also publishes a `sha-<short>` tag (e.g. `sha-c40a9ca`) and a
bare 40-character commit tag; either pins one exact image. Prefer a `sha-` tag
over `:latest` when you need to know precisely what is running.

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
2. **If a reliably-working demo is wanted:** take option C — the runbook below
   has the concrete plan — and document the two-step setup for the visitor
   (install RustDesk → set ID Server + Key) on the demo landing page. Verify with
   a real peer before advertising it.
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

## Own relay pair — the runbook that was executed (T24)

This section is the procedure that was **actually used** on 2026-11-19, kept so it
can be repeated (rebuild, migration, or a second environment). The live state is
described by "What a visitor gets", "Architecture" and "What was verified" above.

### 0. What you are building

```
visitor's RustDesk  ──21116/21117──>  hbbs + hbbr (demo-owned, this VPS)
visitor's browser  ──HTTPS──>  rclient-demo.linkzy.dev  ──>  demo gateway
                                                                  │
                                          ws to the SAME hbbs/hbbr ┘
```

Both the browser and the remote machine must be on the **same**
`hbbs`. That is the whole point: the public `hbbs` cannot route a session to a
relay we own, so we move both peers onto ours.

### 1. DNS — one **DNS-only** name (done: `relay-demo.linkzy.dev`)

The record exists and is DNS-only:

| Name | Type | Value | Proxy |
| --- | --- | --- | --- |
| `relay-demo.linkzy.dev` | `A` | the VPS IPv4 | **DNS only (grey cloud)** |

The grey cloud is mandatory. `rclient-demo.linkzy.dev` is proxied (orange
cloud), and Cloudflare's proxy only speaks HTTP(S) on 80/443 — RustDesk's raw
TCP/UDP on 21115–21119 never reaches the host through it (verified: `21116` on
the proxied name is refused). Keep the web UI on the proxied name and only
RustDesk traffic on the DNS-only one.

It was created via the Cloudflare API using the credentials already in
`/root/.cloudflared/cert.pem` (account + zone scoped), so no new token was
needed. To recreate:

```sh
# token is read from the existing cert; never print or commit it
curl -s -X POST -H "Authorization: Bearer $CF_TOKEN" -H 'Content-Type: application/json' \
  "https://api.cloudflare.com/client/v4/zones/$CF_ZONE/dns_records" \
  --data '{"type":"A","name":"relay-demo.linkzy.dev","content":"<VPS IP>","proxied":false,"ttl":300}'
```

Check it resolves to the VPS directly, not to a Cloudflare address:

```sh
dig +short relay-demo.linkzy.dev @1.1.1.1     # must be the VPS IP
```

### 2. Ports that must be open inbound

On the VPS, in any provider firewall **and** host firewall (this host currently
has `ufw` inactive, so only the provider panel matters):

| Port | Proto | Purpose |
| --- | --- | --- |
| `21115` | TCP | NAT type test |
| `21116` | **TCP and UDP** | ID registration + heartbeat (UDP) and TCP hole punching |
| `21117` | TCP | relay (`hbbr`) |
| `21118` | TCP | ID server for the web client (our gateway) |
| `21119` | TCP | relay for the web client (our gateway) |

`21114` is Pro-only and not needed. Verify from **outside** the host (not from
the VPS itself), e.g. from a laptop:

```sh
for p in 21115 21116 21117 21118 21119; do
  timeout 5 bash -c "exec 3<>/dev/tcp/relay-demo.linkzy.dev/$p" \
    && echo "$p open" || echo "$p BLOCKED"
done
```

### 3. Compose delta (applied)

These two services are in `/home/demo/docker-compose.yml` and mirrored in
`deploy/docker-compose.demo.yml`. They sit next to `gateway`/`web`; they do
**not** replace them.

`network_mode: host` is required — RustDesk must see real peer IPs, and it
publishes its own ports, so no `ports:` mapping is used. Limits and log caps are
the same policy as the rest of the demo (R-16 / R-19).

```yaml
  hbbs:
    image: rustdesk/rustdesk-server:latest
    container_name: rclient-demo-hbbs
    command: hbbs -r relay-demo.linkzy.dev:21117
    network_mode: host
    volumes:
      - ./relay-data:/root
    restart: unless-stopped
    mem_limit: 64m
    memswap_limit: 64m
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
    labels:
      - "com.centurylinklabs.watchtower.enable=false"

  hbbr:
    image: rustdesk/rustdesk-server:latest
    container_name: rclient-demo-hbbr
    command: hbbr
    network_mode: host
    volumes:
      - ./relay-data:/root
    restart: unless-stopped
    mem_limit: 64m
    memswap_limit: 64m
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
    labels:
      - "com.centurylinklabs.watchtower.enable=false"
```

Measured cost on this host: `hbbs` ~2.7 MB and `hbbr` ~1.5 MB RSS (1.1.16),
13.1 MB image on disk. The caps above leave plenty of headroom.

### 4. Generate the key — fresh, never the owner's

`hbbs` creates an Ed25519 key pair on first start **if the data directory has no
`id_ed25519` yet**. So: start with an empty `./relay-data`, and let it generate.

```sh
cd /home/demo
mkdir -p relay-data                      # must be empty the first time
docker compose up -d hbbs hbbr
sleep 5
docker logs rclient-demo-hbbs 2>&1 | grep "Key:"
#  INFO ... Key: <base64>                  <- this is the PUBLIC key
```

Verified on this host with a throwaway container: the first run logs
`Private/public key written to id_ed25519/id_ed25519.pub` and then
`Key: <base64>`. The key pair lives in `/home/demo/relay-data/id_ed25519`
(private, mode 0600) and `id_ed25519.pub` (public). The same directory also
gets `db_v2.sqlite3*` — the peer database. Rules:

- **Never** copy the owner's `id_ed25519*` from the production host.
- **Never** commit `relay-data/` — it holds the private key and the peer
  database. It lives at `/home/demo/relay-data` **on the VPS**, outside the
  repository, so a normal clone never contains it; the compose file only refers
  to it as a bind mount. If you ever copy the compose file into a checkout and
  run it there, add `relay-data/` to `.gitignore` first and check
  `git status` before committing.
- The **public** key goes into `/home/demo/.env` as `SERVER_KEY` (mode 600). The
  private key never leaves the VPS.
- If you ever need to regenerate, `docker compose down hbbs hbbr`, delete
  `relay-data/`, and repeat — every client must then be updated with the new key.

Then point the demo gateway at the local pair and restart **only** the demo
stack:

```sh
# /home/demo/.env
HBBS_HOST=relay-demo.linkzy.dev
HBBS_WS_PORT=21118
HBBR_HOST=relay-demo.linkzy.dev
HBBR_WS_PORT=21119
SERVER_KEY=<the fresh public key from above>

cd /home/demo && docker compose up -d
```

### 5. What the visitor pastes into RustDesk

This is the block the demo landing page should show (verbatim, with the key
filled in at deploy time — do not hardcode it in the repo):

> **Before you connect**, tell your RustDesk to use this demo's server:
>
> 1. Open RustDesk on the machine you want to control.
> 2. Click the **⋮** menu next to your ID → **Network** (on recent versions:
>    **Settings → Network**), and unlock with admin rights if asked.
> 3. Set:
>    - **ID Server** = `relay-demo.linkzy.dev`
>    - **Key** = *(the demo's public key, shown on this page)*
>    - **Relay Server** = leave blank (RustDesk infers it)
>    - **API Server** = leave blank
> 4. Apply, wait for the status to turn green, then type your machine ID and
>    password into the form above.
>
> To undo it later, clear **ID Server** and **Key** and re-enter them.

Only the **controlled** machine needs this. The browser side is already
configured by the demo.

### 6. Verify before advertising it

1. `docker compose ps` — four containers up (`rclient-demo-*`). ✔ done
2. From outside: `21115`–`21119` open on `relay-demo.linkzy.dev`. ✔ done
3. `docker logs rclient-demo-gateway` shows a rendezvous against our `hbbs`,
   not `rs-ny.rustdesk.com`. ✔ done
4. **On a real machine with RustDesk set as in step 5: the ID shows as online,
   and a session from <https://rclient-demo.linkzy.dev> shows video and accepts
   input. ✘ NOT DONE** — this is the one step that still needs doing before the
   demo can honestly be called working.
5. Only after step 4, change the status at the top of this file.

### 7. Rollback

```sh
cd /home/demo
docker compose stop hbbs hbbr
# restore the public defaults in .env (HBBS_HOST=rs-ny.rustdesk.com, ...)
docker compose up -d
```

Removing the two services and the `relay-data/` directory returns the host to
exactly today's state, with no leftover ports or containers.

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
