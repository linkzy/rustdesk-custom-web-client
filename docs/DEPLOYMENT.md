# Deployment

How to get rclient running on your own machine, from a bare VPS to a session in a
browser. This is the long version; the [README](../README.md) has the three-command
quickstart and the reasoning.

- [Before you start](#before-you-start)
- [1. RustDesk on the machine you want to control](#1-rustdesk-on-the-machine-you-want-to-control)
- [2. A relay (hbbs + hbbr)](#2-a-relay-hbbs--hbbr)
- [3. rclient itself](#3-rclient-itself)
- [4. HTTPS](#4-https)
- [5. Connect and verify](#5-connect-and-verify)
- [Operating it](#operating-it)
- [Troubleshooting](#troubleshooting)

---

## Before you start

| You need | Notes |
|---|---|
| A machine running RustDesk | The thing you will control. Any OS RustDesk supports. |
| A relay | Your own `hbbs`/`hbbr`, or a public relay. The repo ships no relay. |
| Docker + Docker Compose | Wherever rclient runs. `docker-compose.prod.yml` needs nothing else. |
| A domain, or a Cloudflare Tunnel | WebCodecs needs HTTPS. `localhost` also counts as secure. |

Ports, if you host the relay yourself: `21115/tcp`, `21116/tcp+udp`, `21117/tcp`,
`21118/tcp`, `21119/tcp`. rclient's gateway uses only `21118` and `21119`
(WebSocket).

---

## 1. RustDesk on the machine you want to control

1. Install [RustDesk](https://rustdesk.com/docs/en/client/windows-and-mac/) and
   open it.
2. Note the **ID** and set a **password** — that is what you type in rclient.
3. **Settings → Network**: set the ID/relay server to your relay's address, and the
   **Key** to its public key (step 2).
4. Leave it running. Running as a background service survives reboots.

The host needs no port forwarding; it reaches the internet through the relay.

---

## 2. A relay (hbbs + hbbr)

Skip this if you already run one. rclient connects to whatever `HBBS_HOST` /
`HBBR_HOST` / `SERVER_KEY` you point it at.

On your VPS, write a compose file of your own — this one is not in the repository:

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

Paste that key into RustDesk's **Network → Key** on every host, and into
`SERVER_KEY` in step 3. Both `hbbs` and `hbbr` share the `./data` volume — the key
lives there.

If you run the relay and rclient on the same host, note that the compose files put
the gateway on its own bridge network: a relay on the same machine is **not**
reachable as `hbbs` by name from the gateway. Use the host's IP or DNS name.

---

## 3. rclient itself

| Compose file | What it does |
|---|---|
| `docker-compose.prod.yml` | Runs the published `ghcr.io/linkzy/rclient-*` images. No build. |
| `docker-compose.yml` | Builds `gateway/` and `web/` locally. For development or a fork. |

Both publish only the `web` container (on `${WEB_PORT:-80}`) and keep the gateway
internal on port 4000 — never expose that port.

```bash
git clone https://github.com/linkzy/rustdesk-custom-web-client
cd rustdesk-custom-web-client
cp .env.example .env
```

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

Optional hCaptcha is configured on the gateway, not in the compose file:
`CAPTCHA_ENABLED`, `HCAPTCHA_SITE_KEY`, `HCAPTCHA_SECRET_KEY` (see
`gateway/.env.example`). The connect form reads `GET /config` to decide whether to
show the widget.

Building from source needs Node 22 — see [`DEVELOPMENT.md`](./DEVELOPMENT.md).

---

## 4. HTTPS

Browsers only expose WebCodecs in a secure context, so put TLS in front of the
`web` container.

### Cloudflare Tunnel (no open ports)

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
sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

### Reverse proxy

Any TLS-terminating proxy works. Caddy, in full:

```
rclient.yourdomain.com {
  reverse_proxy localhost:80
}
```

The container's own nginx already proxies `/ws` and `/config` to the gateway, so
your proxy only needs to forward HTTP to port 80. A proxy that drops the WebSocket
upgrade is the most common failure: the page loads, then `/ws` closes immediately.

---

## 5. Connect and verify

1. Open your URL.
2. Enter the remote machine's ID and password.
3. Press **Connect**.

A healthy first run shows the remote screen within a few seconds. If it does not,
see below.

---

## Operating it

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f gateway
docker compose -f docker-compose.prod.yml pull && docker compose -f docker-compose.prod.yml up -d
```

Rollback, or staying put on purpose: pin the image tag in the compose file and
run `up -d` again.

```yaml
# docker-compose.prod.yml
image: ghcr.io/linkzy/rclient-gateway:0.2.0
image: ghcr.io/linkzy/rclient-web:0.2.0
```

A `v*` tag publishes `0.2.0`, `0.2` and `sha-<short>` alongside `latest` on both
images (see [`RELEASING.md`](./RELEASING.md)). Every commit build also publishes
`sha-<short>` (e.g. `sha-c40a9ca`) and a bare 40-character commit tag — either
pins one exact image, and is the most precise rollback target.

The two images are **separate builds**, so a release tag can exist on the
gateway before the web image has finished. Check both before pinning:

```bash
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

The gateway logs connection events — target ID, relay addresses, handshake stages,
frame rates — and never the password. A verbose per-keystroke log exists in
`gateway/src/server.ts` but is commented out.

---

## Troubleshooting

| Symptom | Likely cause and what to do |
|---|---|
| **"Wrong password"** | The RustDesk password on the host, not your rclient login (there isn't one). Check it in RustDesk, and remember the host may have both a permanent and a one-time password. |
| **"That machine is offline"** | RustDesk is not running on the host, or it is not connected to the relay you configured. Check both ends point at the same `HBBS_HOST`. |
| **"The relay did not answer"** | The gateway could not reach `HBBS_HOST`:`HBBS_WS_PORT` before its 15 s timeout. Check the address is reachable **from the gateway container**, not from your laptop: `docker compose exec gateway node -e "require('net').connect(21118,'your-relay-host').on('connect',()=>{console.log('open');process.exit(0)}).on('error',e=>{console.log(e.code);process.exit(1)})"` (a DNS or `ECONNREFUSED` error names the problem). |
| **"Could not reach the relay"** | Wrong host or port, or the relay's WebSocket ports are blocked on the way. `21118`/`21119` must be reachable from the gateway. |
| **Connects, then "waiting for image"** | The rendezvous worked but the relay stream did not — most often the relay ports (`21117`/`21119`) are unreachable. This is exactly the public-relay problem the demo has; see [`../deploy/DEMO.md`](../deploy/DEMO.md). |
| **Page loads, `/ws` closes immediately** | Your reverse proxy is not upgrading the WebSocket. Compare with `web/nginx.conf`. |
| **No video** | The browser lacks WebCodecs `VideoDecoder`, or you are on plain HTTP (not a secure context). Open the browser console; the decoder logs the codec it initialised. |
| **No audio, video fine** | The browser lacks WebCodecs `AudioDecoder`, or the host sends more than 2 channels. Audio is skipped, by design, without breaking the session. |
| **Typing does nothing** | On a phone there is no keyboard yet (mouse/touch only). On desktop, click the canvas once so it has focus. |
| **Ctrl+C / Ctrl+V do nothing** | Not forwarded yet — known bug KI-006. |

The in-app **Advanced options → Show debug info** panel shows the gateway FPS,
decoded FPS, frame interval, decode time and WebSocket ping, and the log lines
behind each of the states above.

---

## See also

| File | Why |
|---|---|
| [`../README.md`](../README.md) | The short version and what the project is |
| [`README.md`](./README.md) | Index of all documentation |
| [`DEVELOPMENT.md`](./DEVELOPMENT.md) | Running the code locally, checks, tests |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | How the parts fit, gateway API, limitations |
| [`../deploy/DEMO.md`](../deploy/DEMO.md) | The public demo instance and its caveat |
| [`../SECURITY.md`](../SECURITY.md) | Threat model and reporting |
