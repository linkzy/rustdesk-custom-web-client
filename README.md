# rclient — Browser-Based Remote Desktop for RustDesk

**Access your computers from any browser — no app needed.**

rclient is an open-source web client for [RustDesk](https://rustdesk.com/) that works with your **self-hosted** RustDesk relay server. Type a machine ID and password in your browser and you're in — keyboard, mouse, and live video, all without installing anything.

> 🌐 **Live demo:** [rclient.linkzy.dev](https://rclient.linkzy.dev)  
> _(This instance is the author's personal production deployment. You can test it with your own RustDesk machine ID and password.)_

---

## What Problem Does This Solve?

RustDesk is a great open-source remote desktop tool, and running your own relay server gives you full control and low latency. But the native apps must be installed on every device you want to control *from*.

rclient fills that gap: once it's running on your VPS, you can connect to any of your machines from any browser — a friend's computer, a phone, a work machine where you can't install software.

---

## How It Works

```
Your Browser
    │
    │  HTTPS/WSS  (Cloudflare Tunnel or your reverse proxy)
    ▼
rclient Web UI  ──►  rclient Gateway
(React + WebCodecs)   (Node.js)
                           │
                     RustDesk protocol
                     (WebSocket, encrypted)
                           │
                    ┌──────▼──────┐
                    │  Your VPS   │
                    │  hbbs :21118│  ← rendezvous
                    │  hbbr :21119│  ← relay
                    └──────┬──────┘
                           │
                    Remote Machine
                    (RustDesk host app)
```

- **Gateway** (Node.js) — speaks the RustDesk binary protocol, handles encryption, and bridges the browser to your relay server
- **Web UI** (React) — renders the remote screen using the browser's built-in [WebCodecs API](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API), plays the host's audio (Opus via `AudioDecoder`), and captures keyboard and mouse input

---

## Requirements

### On every machine you want to access remotely
- [RustDesk](https://rustdesk.com/docs/en/client/windows-and-mac/) installed and running
- Configured to use **your** relay server (see [Step 1](#step-1-set-up-rustdesk-on-the-host-machine))

### To host rclient
- A Linux VPS or any always-on machine running Docker and Docker Compose
- A domain name (or a free [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) for HTTPS without a static IP)

Sizing depends on how many sessions you run; the project publishes no benchmark. A relay plus gateway plus nginx fits comfortably on a small VPS (1 GB RAM), and memory limits are on the roadmap (`docs/TASKS.md`, R-19).

### For connecting (browser requirements)

rclient relies on the browser's built-in WebCodecs API — there is no WASM fallback:

| Capability | Needed for | Notes |
|---|---|---|
| `VideoDecoder` | Video | Available in current Chromium, Firefox and Safari releases |
| `AudioDecoder` | Audio | Newer than `VideoDecoder`; where it is missing, audio is simply not played |
| `AudioContext` | Audio playback | Widely available |
| Secure context (HTTPS or localhost) | Both | Browsers only expose these APIs over HTTPS |
| Keyboard and mouse events | Input | Mobile browsers have limited keyboard handling |

Whether a specific browser version works depends on its WebCodecs implementation — check its own support tables rather than a version number here. Audio is optional: without `AudioDecoder`/`AudioContext`, video and input keep working (`web/src/video/audio.ts` checks both at load time).

---

## End-to-End Setup Guide

This guide takes you from zero to a working browser-based remote desktop. There are five steps:

1. [Set up RustDesk on the host machine](#step-1-set-up-rustdesk-on-the-host-machine)
2. [Deploy your own relay server](#step-2-deploy-your-relay-server-hbbs--hbbr)
3. [Deploy rclient](#step-3-deploy-rclient)
4. [Expose it over HTTPS](#step-4-expose-rclient-via-https)
5. [Connect](#step-5-connect)

---

### Step 1: Set Up RustDesk on the Host Machine

The **host** is the computer you want to control remotely (e.g. your home PC).

1. Download and install [RustDesk](https://rustdesk.com/docs/en/client/windows-and-mac/) on it
2. Open RustDesk. Note your **Machine ID** and set a **Password** (the one you'll type in rclient later)
3. Go to **Settings → Network** and configure your relay server:
   - **ID/Relay Server**: your VPS IP or domain (e.g. `relay.yourdomain.com`)
   - **Key**: the server public key (you'll get this in Step 2)
4. Make sure RustDesk is running (it can run as a background service)

> 💡 The host machine just needs to be on the internet and reachable via your relay server — no port forwarding required.

---

### Step 2: Deploy Your Relay Server (hbbs + hbbr)

Skip this step if you already have a relay server running. rclient talks to whatever relay you point it at (`HBBS_HOST`/`HBBR_HOST`/`SERVER_KEY`, or the Advanced options fields), but the repository ships no default relay configuration — you need a server address and its public key.

**On your VPS**, create a working directory and a compose file of your own for the relay:

```bash
mkdir -p ~/rustdesk/data
cd ~/rustdesk
```

Create `relay-compose.yml` — a relay-only file you write yourself; it is **not** part of this repository, which ships only the two client compose files described in Step 3. (Pick any filename you like; the commands below use this one.)

```yaml
version: "3"

networks:
  rustdesk-net:
    name: rustdesk-net

services:
  hbbs:
    image: rustdesk/rustdesk-server:latest
    container_name: hbbs
    command: hbbs
    ports:
      - "21115:21115"
      - "21116:21116"
      - "21116:21116/udp"
      - "21118:21118"
    volumes:
      - ./data:/root
    networks:
      - rustdesk-net
    restart: unless-stopped
    depends_on:
      - hbbr

  hbbr:
    image: rustdesk/rustdesk-server:latest
    container_name: hbbr
    command: hbbr
    ports:
      - "21117:21117"
      - "21119:21119"
    volumes:
      - ./data:/root
    networks:
      - rustdesk-net
    restart: unless-stopped
```

Start it and grab the server key:

```bash
docker compose -f relay-compose.yml up -d
docker logs hbbs 2>&1 | grep "Key:"
```

The key is a base64 string (e.g. `<your-server-public-key>`); keep it — the gateway and every RustDesk host need it.

Go back to Step 1 and paste this key into RustDesk's **Network → Key** field on your host machine.

---

### Step 3: Deploy rclient

The repository ships two compose files:

| File | What it does |
|---|---|
| `docker-compose.yml` | Builds the images locally from `gateway/` and `web/`. For development or a self-built deployment. |
| `docker-compose.prod.yml` | Runs the pre-built `ghcr.io/linkzy/rclient-*:latest` images (the owner's registry path — a fork should change it to its own `ghcr.io/<owner>/…`). For deploying without a build. |

Both expose the `web` container on `${WEB_PORT:-80}` and keep the gateway internal on `rclient` network port 4000.

**Option A — pre-built images (recommended for a VPS):**

```bash
cd rclient   # your clone of this repository
cp .env.example .env   # then edit it
docker compose -f docker-compose.prod.yml up -d
```

**Option B — build from source:** same commands with `docker-compose.yml`.

Create `.env` next to the compose file (see `.env.example`):

```env
HBBS_HOST=your-rustdesk-server.com
HBBS_WS_PORT=21118
HBBR_HOST=your-rustdesk-server.com
HBBR_WS_PORT=21119
SERVER_KEY=your-server-public-key-base64
WEB_PORT=80
```

The web UI is then reachable on the port you set in `WEB_PORT` (80 by default).

`HBBS_HOST`/`HBBR_HOST` must be reachable **from the gateway container**. The repo's compose files put the gateway on their own `rclient` bridge network, so a relay running on the same host is not reachable as `hbbs` by name — use the host's IP or DNS name (or put both on a shared Docker network yourself).

Optional hCaptcha (see `gateway/.env.example`) is configured on the gateway, not in the compose file: `CAPTCHA_ENABLED`, `HCAPTCHA_SITE_KEY`, `HCAPTCHA_SECRET_KEY`. The browser form reads `GET /config` (proxied by nginx to the gateway) to decide whether to render the widget.

---

### Step 4: Expose rclient via HTTPS

Browsers only expose WebCodecs in a secure context, so serve the page over HTTPS (or open it on `localhost`). Two options:

#### Option A — Cloudflare Tunnel (recommended, free, no port forwarding needed)

Install [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/):

```bash
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb
```

Log in and create a tunnel:

```bash
cloudflared tunnel login
cloudflared tunnel create rclient
```

Create `/etc/cloudflared/config.yml`:

```yaml
tunnel: <your-tunnel-id>
credentials-file: /root/.cloudflared/<your-tunnel-id>.json

ingress:
  - hostname: rclient.yourdomain.com
    service: http://localhost:80
  - service: http_status:404
```

Add the DNS record and start:

```bash
cloudflared tunnel route dns rclient rclient.yourdomain.com
sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

#### Option B — Reverse proxy with Let's Encrypt (nginx, Caddy, Traefik)

Example with Caddy:

```
rclient.yourdomain.com {
  reverse_proxy localhost:80
}
```

---

### Step 5: Connect

1. Open `https://rclient.yourdomain.com` in your browser
2. Enter the **Machine ID** from RustDesk on the host machine
3. Enter the **Password** you set in RustDesk
4. Click **Connect**

You should see the remote screen within a few seconds.

---

## Environment Variables

Read by the gateway at startup (`gateway/src/rendezvous.ts`, `relay.ts`, `server.ts`):

| Variable | Read by | Description | Default in code |
|---|---|---|---|
| `HBBS_HOST` | gateway | Rendezvous server hostname | `localhost` |
| `HBBS_WS_PORT` | gateway | hbbs WebSocket port | `21118` |
| `HBBR_HOST` | gateway | Relay server hostname | the relay address returned by hbbs |
| `HBBR_WS_PORT` | gateway | hbbr WebSocket port | `21119` |
| `SERVER_KEY` | gateway | Server public key (base64, from hbbs logs), sent as `licence_key` | empty |
| `GATEWAY_PORT` | gateway | Port the gateway listens on for browser WS and `/config` (compose sets `4000`) | `4000` |
| `CAPTCHA_ENABLED` | gateway | Set to `true` to require an hCaptcha token before connecting | `false` |
| `HCAPTCHA_SITE_KEY` | gateway | hCaptcha site key, served to the browser via `GET /config` | empty |
| `HCAPTCHA_SECRET_KEY` | gateway | hCaptcha secret key, used for server-side verification | empty |
| `WEB_PORT` | compose | Host port the `web` container is published on | `80` |

`GATEWAY_PORT` can be changed, but `web/nginx.conf` proxies `/ws` and `/config` to `gateway:4000`; change there too if you do.

The "Advanced options" section of the connect form lets a user override the rendezvous host, relay host and server key **per connection** from the browser; those overrides are stored in `localStorage` (see the Privacy section).

---

## Performance

rclient is functional and usable, but no benchmark is published here. What determines the experience:

- **Video**: frame rate depends on the host machine's encoder and the relay round-trip. The gateway asks for 30 FPS (`custom_fps: 30`), sends `image_quality` 3 at login and 2 afterwards, and sets `video_ack_required: false` so the host does not block waiting for per-frame acks.
- **Input**: keyboard and mouse events are forwarded as they arrive; perceived latency follows the network path to your relay.
- **Latency**: determined mainly by your relay server location — co-locating relay and host in the same region helps most.
- The in-app debug overlay (Advanced options → Show debug info) shows gateway FPS, decoded FPS, frame interval, decode time and WebSocket ping.

---

## Limitations

| Issue | Status |
|---|---|
| No file transfer | Not implemented (roadmap) |
| Single monitor only | Not implemented (roadmap) |
| Clipboard sync | Not implemented (roadmap) |
| Mobile keyboard input | Not implemented — mouse/touch only |
| Keyboard shortcuts (Ctrl+C, Ctrl+V, …) | Not forwarded — open bug, see KI-006 in `docs/KNOWN_ISSUES.md` |
| Audio where the browser lacks `AudioDecoder` | Not played; video and input still work |

---

## Roadmap

See `docs/TASKS.md` for full status. Key items:

- [ ] **Past hosts cards** — after a successful connection, save the host as a card (ID, optional label, custom relay). Clicking a card fills the form. If it ever stores passwords, it must follow the same "Remember password" opt-in rule.
- [ ] **Demo defaults to public RustDesk servers** — so random visitors can try it with their own machines
- [ ] **Mobile keyboard input** — on-screen keyboard overlay or device keyboard forwarding for mobile browsers
- [ ] **File transfer** — upload/download files to/from the remote machine
- [ ] **Multi-monitor support** — switch between displays
- [ ] **Clipboard sync** — paste text into the remote machine
- [ ] **Session auto-reconnect** — reconnect automatically after network drop

**Done:** video (H264/VP9/VP8/AV1 via WebCodecs), keyboard and mouse input, audio (Opus via WebCodecs `AudioDecoder`), fullscreen, fit/1:1 scaling, per-connection relay overrides, hCaptcha, a debug overlay, and persisted device ID / relay settings.

---

## Privacy and Security

### The RustDesk password

- The password field is **not saved by default**. It stays in the page's memory for the session and is sent to the gateway, which hashes it (`SHA256(SHA256(password + salt) + challenge)`) and sends only the hash to the remote machine.
- It is written to the browser's `localStorage` (`rclient_password`) **only when you tick "Remember password"**, and only after the connection has succeeded. The box is off by default. On a shared computer leave it off; if a password was saved earlier, untick the box (this deletes it immediately) or use a private window.
- Unticked, rclient deletes any password saved by an earlier visit instead of reusing it.
- The gateway never writes the password to disk and does not log it. It logs connection events (target ID, rendezvous/relay addresses, handshake stages, frame-rate stats) with `[gateway]`/`[session]`/`[relay]` prefixes. A verbose per-keystroke log exists in `gateway/src/server.ts` but is commented out; restoring it would log what you type.

### What the browser keeps for a normal session

Even without "Remember password", the page stores preferences in `localStorage`:

| Key | Contents |
|---|---|
| `rclient_target_id` | last device ID typed |
| `rclient_hbbs_host`, `rclient_hbbr_host`, `rclient_server_key` | Advanced options overrides |
| `rclient_advanced_open`, `rclient_debug_visible`, `rclient_fit` | UI preferences |
| `rclient_remember_password` | whether you opted in |

There are no cookies and no client-side analytics added by this project. On the hosted instance at `rclient.linkzy.dev`, **Cloudflare Web Analytics** is injected into the page by the deployment (the beacon script in the served HTML), so the host sees page views; a self-hosted deployment does not get it from this repository.

### Deployment

- **Never expose the gateway port (4000) publicly** — only the `web` container should be public-facing. In both compose files the gateway is `expose`d, not published.
- **Use HTTPS** — required for WebCodecs and important for protecting your connection password in transit.
- **The browser never sees RustDesk encryption keys** — the session key exchange (`tweetnacl`) happens in the gateway.

---

## Project Structure

```
rclient/
├── gateway/          ← Node.js/TypeScript backend (RustDesk protocol bridge)
│   └── src/
│       ├── proto/         ← .proto files
│       ├── utils/         ← protobuf helpers, key mapping
│       ├── rendezvous.ts  ← hbbs WebSocket client
│       ├── relay.ts       ← hbbr WebSocket client
│       ├── session.ts     ← per-connection session (encryption, video, audio, input)
│       └── server.ts      ← WebSocket server facing the browser
├── web/              ← React/TypeScript frontend
│   └── src/
│       ├── components/    ← ConnectForm, RemoteScreen, DebugPanel, StatsOverlay
│       ├── hooks/         ← useGateway (WebSocket connection)
│       ├── utils/         ← password storage (Remember password)
│       └── video/         ← WebCodecs video decoder + Opus audio player
├── docker-compose.yml       ← builds from source
├── docker-compose.prod.yml  ← runs the ghcr.io images
└── docs/             ← Technical documentation
```

---

## Developer Documentation

For contributors and AI agents, the full technical docs are in [`docs/`](./docs/):

| File | Contents |
|---|---|
| [`AGENTS.md`](./AGENTS.md) | Short entry point for AI agents and new contributors |
| [`docs/AI_GUIDELINES.md`](./docs/AI_GUIDELINES.md) | Architecture overview, coding conventions, common pitfalls |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | System design, component diagram, gateway WebSocket API |
| [`docs/PROTOCOL.md`](./docs/PROTOCOL.md) | RustDesk protocol reference (protobuf, encryption, codecs) |
| [`docs/TASKS.md`](./docs/TASKS.md) | Task list and roadmap with status |
| [`docs/KNOWN_ISSUES.md`](./docs/KNOWN_ISSUES.md) | Confirmed bugs with root cause analysis |

---

## Contributing

1. Read [`AGENTS.md`](./AGENTS.md), then [`docs/AI_GUIDELINES.md`](./docs/AI_GUIDELINES.md)
2. Check [`docs/KNOWN_ISSUES.md`](./docs/KNOWN_ISSUES.md) before touching `session.ts`
3. Pick something from the [Roadmap](#roadmap) or [Known Issues](#limitations)
4. Open a PR

---

## License

MIT
