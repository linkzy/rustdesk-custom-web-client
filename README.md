# rclient — Browser-Based Remote Desktop for RustDesk

**Access your computers from any browser — no app needed.**

rclient is an open-source web client for [RustDesk](https://rustdesk.com/) that works with your **self-hosted** RustDesk relay server. Type a machine ID and password in your browser and you're in — keyboard, mouse, and live video, all without installing anything.

> 🌐 **Live demo:** [rclient.linkzy.dev](https://rclient.linkzy.dev)  
> _(Demo connects to a real relay server in São Paulo, Brazil. You can test with your own RustDesk machine ID and password.)_

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
- **Web UI** (React) — renders the remote screen using the browser's built-in [WebCodecs API](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API), captures keyboard and mouse input

---

## Requirements

### On every machine you want to access remotely
- [RustDesk](https://rustdesk.com/docs/en/client/windows-and-mac/) installed and running
- Configured to use **your** relay server (see [Step 1](#step-1-set-up-rustdesk-on-the-host-machine))

### To host rclient
- A Linux VPS (1 GB RAM minimum — Oracle Cloud free tier works great)
- Docker and Docker Compose installed
- A domain name (or a free [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) for HTTPS without a static IP)

### For connecting (browser requirements)
| Browser | Support |
|---|---|
| Chrome / Edge 94+ | ✅ Full |
| Firefox 130+ | ✅ Full |
| Safari 16.4+ | ⚠️ Partial (WebCodecs limited) |
| Mobile browsers | ⚠️ Input handling limited |

---

## End-to-End Setup Guide

This guide takes you from zero to a working browser-based remote desktop. There are three parts:

1. [Set up RustDesk on the host machine](#step-1-set-up-rustdesk-on-the-host-machine)
2. [Deploy your own relay server](#step-2-deploy-your-relay-server-hbbs--hbbr)
3. [Deploy rclient](#step-3-deploy-rclient)

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

Skip this step if you already have a relay server running. If you're using public RustDesk servers, rclient will still work — but running your own gives you lower latency and full privacy.

**On your VPS**, create a working directory and compose file:

```bash
mkdir -p ~/rustdesk/data
cd ~/rustdesk
```

Create `docker-compose.infra.yml`:

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
docker compose -f docker-compose.infra.yml up -d
docker logs hbbs 2>&1 | grep "Key:"
```

The key looks like: `zJDp2iyK8zXDFZYUQxyftU+C9254fdIb3Xmngpj9DfI=`

Go back to Step 1 and paste this key into RustDesk's **Network → Key** field on your host machine.

---

### Step 3: Deploy rclient

**On your VPS** (same machine as the relay, or a different one), create `docker-compose.app.yml`:

```yaml
version: "3"

networks:
  rustdesk-net:
    external: true
    name: rustdesk-net

services:
  gateway:
    image: ghcr.io/linkzy/rclient-gateway:latest
    container_name: rclient-gateway
    environment:
      - HBBS_HOST=${HBBS_HOST:-hbbs}
      - HBBS_WS_PORT=${HBBS_WS_PORT:-21118}
      - HBBR_HOST=${HBBR_HOST:-hbbr}
      - HBBR_WS_PORT=${HBBR_WS_PORT:-21119}
      - SERVER_KEY=${SERVER_KEY}
    networks:
      - rustdesk-net
    restart: unless-stopped

  web:
    image: ghcr.io/linkzy/rclient-web:latest
    container_name: rclient-web
    ports:
      - "127.0.0.1:8080:80"
    networks:
      - rustdesk-net
    restart: unless-stopped
    depends_on:
      - gateway
```

Create a `.env` file next to it:

```env
SERVER_KEY=your-server-key-here
```

Start it:

```bash
docker compose -f docker-compose.app.yml up -d
```

The web UI is now running on `http://localhost:8080`.

---

### Step 4: Expose rclient via HTTPS

Browsers require HTTPS for WebCodecs to work. Two options:

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
    service: http://localhost:8080
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
  reverse_proxy localhost:8080
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

| Variable | Description | Default |
|---|---|---|
| `SERVER_KEY` | Server public key (base64, from hbbs logs) | _required_ |
| `HBBS_HOST` | Rendezvous server hostname | `hbbs` |
| `HBBS_WS_PORT` | hbbs WebSocket port | `21118` |
| `HBBR_HOST` | Relay server hostname | `hbbr` |
| `HBBR_WS_PORT` | hbbr WebSocket port | `21119` |

---

## Performance

rclient is functional and usable. On a well-located relay server (e.g. same region as your host machine):

- **Keyboard/mouse input**: near-instant (< 10ms perceived latency)
- **Video**: FPS depends on host machine performance and relay proximity. Typing and browsing are smooth.
- **Latency**: determined mainly by your relay server location — co-locating relay and host in the same region helps most

---

## Limitations

| Issue | Status |
|---|---|---|
| No audio | Planned (see Roadmap) |
| No file transfer | Planned |
| Single monitor only | Planned |
| Clipboard sync | Planned |

---

## Roadmap

See `docs/TASKS.md` for full status. Key items:

- [ ] **Past hosts cards** — after a successful connection, save the host as a card (ID, password, custom relay). Click to auto-connect.
- [ ] **Demo defaults to public RustDesk servers** — so random visitors can try it with their own machines
- [ ] **Mobile keyboard input** — on-screen keyboard overlay or device keyboard forwarding for mobile browsers
- [ ] **Audio streaming** — receive and play remote audio in the browser
- [ ] **File transfer** — upload/download files to/from the remote machine
- [ ] **Multi-monitor support** — switch between displays
- [ ] **Clipboard sync** — paste text into the remote machine
- [ ] **Session auto-reconnect** — reconnect automatically after network drop

---

## Security Considerations

- **Never expose the gateway port (4000) publicly** — only the `web` container should be public-facing. The gateway is automatically internal-only in the provided compose setup.
- **Use HTTPS** — required for WebCodecs and important for protecting your connection password in transit.
- **Passwords are never stored** — rclient only uses the password during the RustDesk handshake and never logs or persists it.

---

## Project Structure

```
rclient/
├── gateway/          ← Node.js/TypeScript backend (RustDesk protocol bridge)
│   └── src/
│       ├── proto/         ← .proto files
│       ├── rendezvous.ts  ← hbbs WebSocket client
│       ├── relay.ts       ← hbbr WebSocket client
│       ├── session.ts     ← per-connection session (encryption, video, input)
│       └── server.ts      ← WebSocket server facing the browser
├── web/              ← React/TypeScript frontend
│   └── src/
│       ├── components/    ← ConnectForm, RemoteScreen
│       ├── hooks/         ← useGateway (WebSocket connection)
│       └── video/         ← WebCodecs decoder
├── docker-compose.yml
├── docker-compose.prod.yml
└── docs/             ← Technical documentation
```

---

## Developer Documentation

For contributors and AI agents, the full technical docs are in [`docs/`](./docs/):

| File | Contents |
|---|---|
| [`docs/AI_GUIDELINES.md`](./docs/AI_GUIDELINES.md) | Architecture overview, coding conventions, common pitfalls |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | System design, component diagram, gateway WebSocket API |
| [`docs/PROTOCOL.md`](./docs/PROTOCOL.md) | RustDesk protocol reference (protobuf, encryption, codecs) |
| [`docs/KNOWN_ISSUES.md`](./docs/KNOWN_ISSUES.md) | Confirmed bugs with root cause analysis |

---

## Contributing

1. Read [`docs/AI_GUIDELINES.md`](./docs/AI_GUIDELINES.md) first
2. Check [`docs/KNOWN_ISSUES.md`](./docs/KNOWN_ISSUES.md) before touching `session.ts`
3. Pick something from the [Roadmap](#roadmap) or [Known Issues](#limitations)
4. Open a PR

---

## License

MIT
