# Running a public demo of rclient

rclient is self-hosted: everyone runs their own relay and their own instance. This
document is a **generic** recipe for standing up a *separate* instance you can
point strangers at, so they can try the client without you exposing your private
relay, your machines or your production deployment.

It contains no real hostnames, addresses, IDs or keys — every value below is a
placeholder you replace with your own. If you write your own notes about a
specific deployment, keep them out of this repository.

## What "a demo" means here

Four things, and they are separate on purpose:

| Piece | What it is | Public? |
|---|---|---|
| `web` + `gateway` | the application, from the published images | the web container only, behind a TLS reverse proxy or tunnel |
| `hbbs` + `hbbr` | the demo's **own** RustDesk relay pair, with its own key | reachable directly on the relay ports |
| the demo hostname | where visitors load the UI | public |
| the relay hostname | where visitors point their RustDesk app | public, but **DNS-only** (not proxied) |

Do not point a demo at RustDesk's shared public servers: their relay ports may be
unreachable from your host, and you cannot verify anything you do not control.
Running your own pair is the only configuration a demo can honestly claim works.

## 1. The relay pair

RustDesk's `hbbs` (rendezvous) and `hbbr` (relay) must see real peer addresses, so
they run with **host networking** and bind these ports:

| Port | Protocol | Purpose |
|---|---|---|
| `21115` | tcp | NAT type test |
| `21116` | tcp **and udp** | ID registration |
| `21117` | tcp | relay |
| `21118` | tcp/ws | ID server for the web client |
| `21119` | tcp/ws | relay for the web client |

**The relay needs a DNS-only record.** A proxied (orange-cloud) hostname carries
only HTTP(S) on 80/443, so raw RustDesk traffic on 21116/21117 cannot pass through
it. Use a plain `A` record, e.g. `relay-demo.example.com` → your host's IP.

`hbbs` generates its key pair on first start. Put the **public** half in the demo's
`.env` as `SERVER_KEY` and show it to visitors; the private half stays on the host
and must never leave it.

## 2. The application

Two containers, one internal network, the gateway never published:

```yaml
name: rclient-demo

services:
  gateway:
    image: ghcr.io/YOUR_USER/rclient-gateway:latest
    restart: unless-stopped
    env_file: [.env]
    environment:
      - GATEWAY_PORT=4000
    expose: ["4000"]
    networks: [demo]
    # A collecting log driver is what keeps a demo from filling the disk.
    logging: { driver: json-file, options: { max-size: "10m", max-file: "3" } }
    # A hard cap means a runaway session cannot starve the host.
    mem_limit: 192m
    memswap_limit: 192m

  web:
    image: ghcr.io/YOUR_USER/rclient-web:latest
    restart: unless-stopped
    ports: ["127.0.0.1:8090:80"]   # localhost only; the proxy is the public door
    depends_on: [gateway]
    networks: [demo]
    logging: { driver: json-file, options: { max-size: "10m", max-file: "3" } }
    mem_limit: 96m
    memswap_limit: 96m

networks:
  demo:
    driver: bridge
```

The `.env` beside it holds the relay settings and, if you enable it, the captcha
keys:

```env
HBBS_HOST=relay-demo.example.com
HBBS_WS_PORT=21118
HBBR_HOST=relay-demo.example.com
HBBR_WS_PORT=21119
SERVER_KEY=<the relay's PUBLIC key>

CAPTCHA_ENABLED=false
WEB_PORT=8090
```

`SERVER_KEY` is public information (visitors paste it into their RustDesk), but the
file still should not be committed — a `.env` in a repo invites someone to put a
real one next to it.

## 3. The public door

Put TLS in front of the `web` container with whatever you already run: Caddy,
Traefik, nginx, or a Cloudflare Tunnel. Examples are in
[`../docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md).

If you use a tunnel, give the demo its **own** tunnel and its own config file. Do
not add a demo rule to a tunnel that serves anything else: one bad edit there takes
down every hostname on it, and the demo does not deserve that blast radius.

Ready-made pieces live in [`cloudflared/`](./cloudflared/).

## 4. What a visitor has to do

This is the honest cost of a demo that works: their RustDesk app must be pointed at
your relay first.

1. RustDesk → **Network** (next to the ID) → **ID Server** = your relay hostname.
2. **Key** = the demo's public key, shown on the demo page.
3. Leave **Relay Server** and **API Server** blank; RustDesk infers them.
4. Apply, wait for green, then enter that machine's ID and password in rclient.

A machine still on RustDesk's public network will not be found — different relay,
different network. Say that plainly on the demo page, or visitors will report it as
a bug.

Anyone who already runs their own RustDesk server should use **Advanced options**
in rclient instead, and never needs your relay at all.

## 5. Verifying it, honestly

A demo you have not driven end to end is not verified, and "it should work" is not a
status. The minimum proof:

- **Relay**: the ports above accept connections from outside; a wrong key is
  rejected and the right one accepted.
- **Session**: a real RustDesk host registered on your relay, driven from a browser
  through the public URL — login accepted, live video, and keyboard/mouse input
  arriving on the remote machine.
- **Evidence** you can point at: the gateway log lines for that session (login
  accepted, frames), and a screenshot of the live session.

Two traps worth knowing, both learned the hard way:

- **A status code is not a check.** If the app is behind a server with an SPA
  fallback (`try_files $uri /index.html`), a *missing* file returns `200` with the
  app's HTML, never `404`. To prove a path is gone, compare the served bytes with
  the fallback page, or ask the origin directly.
- **A CDN can outlive a deletion.** Static files served through a proxy may be
  cached for hours after you remove them. Anything temporary belongs on a
  no-cache path, and cleanup should be verified against the origin, not the public
  URL.

## 6. Operating it

- **Redeploy**: pull the images and recreate the stack; pin to a release tag rather
  than `latest` if you want a demo that does not change under you. See
  [`../docs/RELEASING.md`](../docs/RELEASING.md).
- **Rotate the relay key** deliberately: every visitor who configured the old key
  must reconfigure. Generate a fresh pair, put the new public key in `.env` and on
  the demo page, restart the gateway, and say on the page that the key changed.
- **Disable anything on the host that auto-updates containers** for the demo, or a
  session in progress gets restarted mid-flight.
- **Rate limiting and captcha are optional**, and worth it if the demo gets
  attention: `CAPTCHA_ENABLED=true` plus hCaptcha keys.

## 7. Limits to state up front

A demo is not a service. Say so:

- One shared relay on one machine: expect lower frame rates than a dedicated
  relay, and worse with several visitors.
- No guarantees: it can be restarted, rate-limited, or taken down at any time.
- The relay key is public, and rotating it breaks every configured client.
- Audio depends on the browser supporting WebCodecs `AudioDecoder`; where it is
  missing, video and input still work.

Verified behaviour of the project itself (including what has and has not been tested
on a real machine) is recorded in [`../docs/KNOWN_ISSUES.md`](../docs/KNOWN_ISSUES.md)
and the root [`README.md`](../README.md).
