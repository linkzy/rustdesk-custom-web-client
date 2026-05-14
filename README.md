# rclient — RustDesk Web Client

A self-hosted web client for [RustDesk](https://rustdesk.com/) that lets you access your remote machines from any browser — no app installation required.

> **Designed to work with your own self-hosted RustDesk relay server.**

---

## What Is This?

If you run your own RustDesk relay server (`hbbs` + `hbbr`) on a VPS, this project gives you a browser-based client so you can connect to any of your managed machines without installing the RustDesk desktop app.

```
Browser → [rclient web UI] → [rclient gateway] → [your hbbs/hbbr] → Remote Machine
```

---

## How It Works

The project has two components:

| Component | What it does |
|---|---|
| **Gateway** (Node.js) | Speaks the RustDesk protocol on your behalf — connects to your relay server, handles authentication and encryption, and streams video to your browser |
| **Web UI** (React) | Renders the remote screen in a `<canvas>` element using the browser's built-in video decoder (WebCodecs API). Captures your mouse and keyboard input and sends it back |

---

## Requirements

- Docker and Docker Compose on your VPS
- A running self-hosted RustDesk server (`hbbs` + `hbbr`)
- Your RustDesk server's **public key** (printed in the hbbs logs on first run)
- A modern browser (Chrome 94+, Edge 94+, Firefox 130+) for the WebCodecs API

---

## Quick Start

### 1. Clone the repository
```bash
git clone https://github.com/yourusername/rclient.git
cd rclient
```

### 2. Configure environment
```bash
cp .env.example .env
```

Edit `.env`:
```env
HBBS_HOST=your-rustdesk-server.com
HBBS_WS_PORT=21118
HBBR_HOST=your-rustdesk-server.com
HBBR_WS_PORT=21119
SERVER_KEY=your-server-public-key-base64
GATEWAY_PORT=4000
```

### 3. Start the services
```bash
docker compose up -d
```

The web UI will be available at `http://your-vps-ip` (or your domain if configured with TLS).

### 4. Connect to a machine
1. Open the web UI in your browser
2. Enter the **RustDesk ID** of the machine you want to connect to
3. Enter the **connection password** set on that machine
4. Click **Connect**

---

## Configuration

### Environment Variables

| Variable | Description | Default |
|---|---|---|
| `HBBS_HOST` | Your hbbs (rendezvous) server hostname | _required_ |
| `HBBS_WS_PORT` | hbbs WebSocket port | `21118` |
| `HBBR_HOST` | Your hbbr (relay) server hostname | _required_ |
| `HBBR_WS_PORT` | hbbr WebSocket port | `21119` |
| `SERVER_KEY` | Server public key (base64, from hbbs logs) | _required_ |
| `GATEWAY_PORT` | Internal gateway port | `4000` |

### Finding Your Server Key

Run this on your VPS where hbbs is running:
```bash
docker logs hbbs 2>&1 | grep "Key:"
```
or check the `id_ed25519.pub` file in your hbbs data directory.

---

## TLS / HTTPS (Recommended)

Use a reverse proxy (nginx, Caddy, Traefik) with Let's Encrypt in front of the `web` container for HTTPS. The docker-compose file exposes port 80 by default.

Example with Caddy:
```
rclient.yourdomain.com {
  reverse_proxy localhost:80
}
```

---

## Browser Compatibility

| Browser | Support |
|---|---|
| Chrome / Edge 94+ | ✅ Full support |
| Firefox 130+ | ✅ Full support |
| Safari 16.4+ | ⚠️ Partial (WebCodecs limited) |
| Mobile browsers | ⚠️ Input handling limited |

---

## Limitations

- **Session drops after ~10 seconds** — Known issue (KI-001). The keepalive (`TestDelay`) echo is not yet implemented. Reconnecting restores the session. See `docs/KNOWN_ISSUES.md`.
- **Relay-only**: The web client always connects via your relay server (no direct P2P connection). This means latency depends on your relay server location.
- **Single monitor**: Currently connects to the primary display only.
- **No file transfer**: Remote control only (keyboard + mouse + screen).
- **No audio**: Not yet implemented.

---

## Project Status

This project is under active development. See the task list in the developer docs.

---

## Development

See the developer documentation in the `docs/` folder.

```
docs/
├── AI_GUIDELINES.md   — Architecture overview and coding conventions
├── ARCHITECTURE.md    — Detailed system design and component diagram
├── PROTOCOL.md        — RustDesk protocol reference (protobuf, encryption, codecs)
├── TASKS.md           — Development task list
└── KNOWN_ISSUES.md    — Confirmed bugs with root cause and fix guidance
```

---

## Contributing

1. Read `docs/AI_GUIDELINES.md` first
2. Check `docs/TASKS.md` for the current task list
3. Pick a task, implement it, mark it done

---

## License

MIT

---

---

> **For AI agents / developers**: The technical documentation is in [`docs/`](./docs/).  
> Start with [`docs/AI_GUIDELINES.md`](./docs/AI_GUIDELINES.md) for orientation,  
> then [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for system design,  
> [`docs/PROTOCOL.md`](./docs/PROTOCOL.md) for the RustDesk protocol reference,  
> and [`docs/TASKS.md`](./docs/TASKS.md) for the development task list.
> 
