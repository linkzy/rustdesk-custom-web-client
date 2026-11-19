# rclient

**Your computers, in any browser.**

rclient is an open-source web client for [RustDesk](https://rustdesk.com/). It
speaks RustDesk's protocol on your behalf, through **your own relay**, so you can
control a machine from a browser on a computer where you cannot install anything.

[![CI](https://img.shields.io/github/actions/workflow/status/linkzy/rustdesk-custom-web-client/ci.yml?branch=main&label=CI)](https://github.com/linkzy/rustdesk-custom-web-client/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![good first issues](https://img.shields.io/github/issues/linkzy/rustdesk-custom-web-client/good%20first%20issue?label=good%20first%20issues)](https://github.com/linkzy/rustdesk-custom-web-client/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
[![version](https://img.shields.io/github/v/tag/linkzy/rustdesk-custom-web-client?label=version)](https://github.com/linkzy/rustdesk-custom-web-client/tags)

> **Try it: [rclient-demo.linkzy.dev](https://rclient-demo.linkzy.dev)**
>
> ⚠️ The demo is **degraded right now**. It points at RustDesk's public relay
> servers, and their relay ports were refusing connections when it was deployed —
> ID lookups work, but a session can sit at "connected, waiting for image". The
> evidence and the options are in [`deploy/DEMO.md`](./deploy/DEMO.md).
>
> **Running your own relay is the path that is verified.** The demo exists to
> show the UI, not to prove a session works.

---

## Why this exists

RustDesk's native apps must be installed on every device you connect *from*.
That is fine for your own laptop and useless for a friend's machine, a locked-down
work computer, or a phone. rclient closes that gap: the controlling side is a web
page.

The project exists because the official RustDesk web client did not work well with
self-hosted relays.

---

## What works

| | |
|---|---|
| **Video** | H264, VP9, VP8 and AV1 decoded with the browser's [WebCodecs](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API) `VideoDecoder` |
| **Input** | Keyboard and mouse, including key layouts and Caps Lock (fixed in v0.1.1) |
| **Audio** | The host's audio, Opus via WebCodecs `AudioDecoder` — silent on browsers without it |
| **Session** | Fullscreen, fit-to-window / 1:1 scaling, a live FPS/latency overlay |
| **Relay** | Per-connection relay overrides under Advanced options |
| **Privacy** | The password is only stored if you tick "Remember password" |

Keyboard shortcuts like Ctrl+C / Ctrl+V are **not** forwarded yet, and there is no
file transfer, clipboard sync or multi-monitor. The full list is below.

---

## Quickstart

Fastest path: a relay you already run, plus the two containers.

```bash
git clone https://github.com/linkzy/rustdesk-custom-web-client
cd rustdesk-custom-web-client

cp .env.example .env        # fill in HBBS_HOST, HBBR_HOST, SERVER_KEY
docker compose -f docker-compose.prod.yml up -d
```

Open the port from `WEB_PORT` (80 by default) — or put HTTPS in front of it, which
WebCodecs requires. Then enter the remote machine's RustDesk ID and password.

No relay yet? The [full setup guide](#deploying-it-yourself) starts one from
scratch. Everything from zero: [`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md) for
running the code, [`docs/README.md`](./docs/README.md) for every document.

---

## Requirements

**On the machine you connect to:** RustDesk installed and running, pointed at your
relay.

**To host rclient:** a machine running Docker and Docker Compose, and a domain name
(or a free [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)).
Node 22 is only needed to build from source; `docker-compose.prod.yml` uses the
published images.

**In the browser:** a current Chromium, Firefox or Safari, served over HTTPS.
rclient has no WASM fallback — it depends on the browser's own WebCodecs:

| Capability | Needed for | Notes |
|---|---|---|
| `VideoDecoder` | Video | In current Chromium, Firefox and Safari |
| `AudioDecoder` | Audio | Newer; where it is missing, audio is skipped and everything else works |
| `AudioContext` | Audio playback | Widely available |
| Secure context (HTTPS or `localhost`) | Both | Browsers only expose WebCodecs over HTTPS |

Whether a given browser version works depends on its WebCodecs implementation, so
check its own support tables rather than a version number here.

---

## Deploying it yourself

### 1. RustDesk on the machine you want to control

1. Install [RustDesk](https://rustdesk.com/docs/en/client/windows-and-mac/) and open it.
2. Note the **ID** and set a **password** — that is what you will type in rclient.
3. **Settings → Network**: set the ID/relay server to your relay's address, and the
   **Key** to the public key from step 2.
4. Leave it running.

The host needs no port forwarding; it reaches the internet through your relay.

### 2. A relay (hbbs + hbbr)

Skip this if you already run one. rclient does not ship a relay: it connects to
whatever `HBBS_HOST` / `HBBR_HOST` / `SERVER_KEY` you point it at.

On your VPS, write a compose file of your own — this one is not part of the repo:

```yaml
# relay-compose.yml
services:
  hbbs:
    image: rustdesk/rustdesk-server:latest
    command: hbbs
    container_name: hbbs
    ports:
      - "21115:21115"
      - "21116:21116"
      - "21116:21116/udp"
      - "21118:21118"
    volumes:
      - ./data:/root
    restart: unless-stopped
    depends_on: [hbbr]
  hbbr:
    image: rustdesk/rustdesk-server:latest
    command: hbbr
    container_name: hbbr
    ports:
      - "21117:21117"
      - "21119:21119"
    volumes:
      - ./data:/root
    restart: unless-stopped
```

```bash
mkdir -p data && docker compose -f relay-compose.yml up -d
docker logs hbbs 2>&1 | grep "Key:"     # the server public key
```

Paste that key into RustDesk's **Network → Key** field on every host, and into
`SERVER_KEY` below.

### 3. rclient

| Compose file | What it does |
|---|---|
| `docker-compose.prod.yml` | Runs the published `ghcr.io/linkzy/rclient-*` images. No build. |
| `docker-compose.yml` | Builds `gateway/` and `web/` locally. For development or a fork. |

Both publish only the `web` container (on `${WEB_PORT:-80}`) and keep the gateway
internal on port 4000. Copy `.env.example` to `.env` and fill it in:

```env
HBBS_HOST=your-rustdesk-server.com
HBBS_WS_PORT=21118
HBBR_HOST=your-rustdesk-server.com
HBBR_WS_PORT=21119
SERVER_KEY=your-server-public-key-base64
WEB_PORT=80
```

```bash
docker compose -f docker-compose.prod.yml up -d
```

`HBBS_HOST`/`HBBR_HOST` must be reachable **from the gateway container**: the
compose files put it on its own bridge network, so a relay on the same host is not
reachable as `hbbs` by name — use its IP or DNS name.

Building from source needs Node 22 (`npm run install:all`, then the compose file);
[`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md) has the details, including that the
Vite dev server proxies `/ws` but **not** `/config`.

### 4. HTTPS

Browsers only expose WebCodecs over a secure context, so put TLS in front. A
Cloudflare Tunnel needs no open ports:

```bash
cloudflared tunnel login
cloudflared tunnel create rclient
cloudflared tunnel route dns rclient rclient.yourdomain.com
```

```yaml
# /etc/cloudflared/config.yml
tunnel: <your-tunnel-id>
credentials-file: /root/.cloudflared/<your-tunnel-id>.json
ingress:
  - hostname: rclient.yourdomain.com
    service: http://localhost:80
  - service: http_status:404
```

```bash
sudo cloudflared service install && sudo systemctl enable --now cloudflared
```

Any reverse proxy works as well — Caddy is one line:

```
rclient.yourdomain.com {
  reverse_proxy localhost:80
}
```

A common failure is a proxy that drops the WebSocket upgrade: the page loads and
`/ws` closes immediately. The gateway must stay internal; never expose port 4000.

### 5. Connect

Open your URL, enter the machine ID and password, press Connect. If it hangs after
"connected", the relay is the thing to check — see the demo note above.

---

## How it fits together

```
Browser ──HTTPS/WSS──> web (nginx) ──> gateway (Node.js) ──RustDesk protocol──> your relay ──> host
```

- **Gateway** (`gateway/`) holds the RustDesk session encryption, speaks the binary
  protocol and bridges it to your relay. The browser never sees a session key.
- **Web** (`web/`) decodes video and audio with WebCodecs, draws to a canvas and
  captures input.
- **The relay** (hbbs for rendezvous, hbbr for the stream) is yours and is not
  part of this repository.

Design notes and the full browser↔gateway API: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).
Protocol details: [`docs/PROTOCOL.md`](./docs/PROTOCOL.md).

---

## Privacy and security

**The password.** Not saved by default: it stays in the page's memory, goes to the
gateway over HTTPS, and the gateway sends the remote machine a hash
(`SHA256(SHA256(password + salt) + challenge)`), never the password itself. It is
written to `localStorage` **only** if you tick **Remember password**, and only
after the connection succeeds. Unticking deletes it. On a shared computer, leave it
unticked.

**What the browser keeps.** Without that opt-in, only preferences:
`rclient_target_id`, the Advanced-options overrides
(`rclient_hbbs_host`, `rclient_hbbr_host`, `rclient_server_key`), and UI flags
(`rclient_advanced_open`, `rclient_debug_visible`, `rclient_fit`).

**Logging.** The gateway logs connection events — target ID, relay addresses,
handshake stages, frame rates — and never the password. A verbose per-keystroke log
exists in the code but is commented out.

**Analytics.** The project adds none, and sets no cookies. The two hosted instances
are behind Cloudflare, which injects its Web Analytics beacon into the page; a
self-hosted deployment does not get that from this repository.

**Deployment.** Never publish the gateway port (4000) — the gateway holds the
session keys. Use HTTPS. The encryption handshake happens in the gateway, so the
browser is not a place keys can leak from.

Full threat model: [`SECURITY.md`](./SECURITY.md).

---

## Limitations

Honest list; each of these is a known gap, not a bug report you need to file.

| Limitation | Detail |
|---|---|
| Keyboard shortcuts | Ctrl+C / Ctrl+V / Ctrl+A and friends are not forwarded. Open bug (KI-006). |
| File transfer | Not implemented. |
| Clipboard | No sync between browser and host. |
| Multiple monitors | Only the first display is shown. |
| Mobile | Touch/mouse works; there is no on-screen keyboard. |
| Audio | Skipped entirely in browsers without WebCodecs `AudioDecoder`. |
| Reconnect | A dropped socket ends the session; you reconnect by hand. |
| One session per tab | The gateway keeps one session per WebSocket. |
| Force relay | Always through the relay — no direct P2P fallback. |

`docs/KNOWN_ISSUES.md` has the confirmed bugs with root causes;
`docs/ARCHITECTURE.md` explains why each limitation is where it is.

---

## FAQ

**Do I need to run my own relay?**
You need *a* relay: your own, or a public one. Running your own is the point —
lower latency, your data on your server. rclient ships no relay configuration.

**Is the demo working?**
Right now, not reliably. It routes through RustDesk's public servers and their
relay ports were refusing connections; it may sit at "connected, waiting for
image". Your own relay is the verified path. See [`deploy/DEMO.md`](./deploy/DEMO.md).

**Where is the password stored?**
Nowhere, unless you opt in with "Remember password" — then in your browser's
`localStorage`, and never on the server. See [Privacy](#privacy-and-security).

**Why not just use RustDesk's own web client?**
It did not work well with self-hosted relays; that is why this exists.

**Is it tested?**
Yes: 24 unit tests in the gateway and 25 in the web app, plus lint, typecheck and
a production build, all run by [CI](https://github.com/linkzy/rustdesk-custom-web-client/actions/workflows/ci.yml)
on every pull request. The tests pin the pure parts (hashing, framing, key
mapping, storage rules); a real session still needs a RustDesk host.

**Can I use it on my phone?**
Partly. Mouse and touch work; typing on the remote machine does not yet.

**How do I report a bug or ask a question?**
Bugs: the [bug report form](https://github.com/linkzy/rustdesk-custom-web-client/issues/new?template=bug_report.yml).
Questions: [Discussions](https://github.com/linkzy/rustdesk-custom-web-client/discussions).
Security: privately, per [`SECURITY.md`](./SECURITY.md).

---

## Roadmap

Three milestones, published as issues and tracked in
[`docs/TASKS.md`](./docs/TASKS.md):

- **v0.2.0 — Community-ready**: log rotation, memory limits and healthchecks in the
  shipped compose files, structured logging, firewall and reverse-proxy guidance,
  friendlier errors, audio controls, a shortcut help overlay.
- **v0.3.0 — Everyday remote desktop**: reconnect, saved hosts, clipboard sync,
  forwarded shortcuts, mobile keyboard.
- **v0.4.0 — Bigger features**: file transfer, multi-monitor, i18n, themes.

**Seven issues are marked [`good first issue`](https://github.com/linkzy/rustdesk-custom-web-client/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)**
and are deliberately left for contributors: compose log rotation and healthchecks
(#2), audio mute and volume (#5), a shortcut help overlay (#6), friendlier errors
(#7), screenshots for the docs (#8), reverse-proxy examples (#10), and a theme
toggle (#20). Comment on one to claim it.

---

## Contributing

Read [`CONTRIBUTING.md`](./CONTRIBUTING.md) first — it covers what a good report
and PR look like. Then
[`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md) to run both packages, and
[`docs/AI_GUIDELINES.md`](./docs/AI_GUIDELINES.md) for the protocol pitfalls that
break sessions in ways that look unrelated.

AI-assisted contributions are welcome; you are responsible for what you submit.

## License

[MIT](./LICENSE) © Danilo Cavalcante (linkzy)
