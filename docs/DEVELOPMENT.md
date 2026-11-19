# Development — running rclient locally

How to run both packages on your machine without Docker, what the checks are, and
the conventions the history uses. Every command here was run on this repository's
code; where something does not work, that is said plainly.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Node.js 22+ | `engines` at the repo root (`^22.0.0 \|\| >=24`), `.nvmrc` (`22`), both `Dockerfile`s (`node:22-alpine`) and CI all agree on Node 22. |
| npm | Lockfiles exist in both packages, so `npm ci` works. |
| A RustDesk host + relay | Only needed to exercise a real session (see [What works without a RustDesk host](#what-works-without-a-rustdesk-host)). |

Docker is optional: it is only needed for the local image builds at the bottom.

---

## 1. Install

From the repository root:

```bash
npm run install:all      # npm ci in gateway/ then web/
```

or per package:

```bash
cd gateway && npm ci
cd ../web && npm ci
```

Each package has its own `package-lock.json`. The root `package.json` has no
dependencies — it only forwards `test`, `typecheck`, `lint` and `build` to both
packages. There is no npm workspace.

---

## 2. Gateway configuration

The gateway reads `.env` from its own directory (`gateway/src/server.ts` calls
`dotenv.config({ path: path.resolve(__dirname, '../.env') })`, which resolves to
`gateway/.env` both under `ts-node-dev` and from `dist/`).

```bash
cd gateway
cp .env.example .env
```

Fill in:

```env
HBBS_HOST=your-rustdesk-server.com   # rendezvous / ID server
HBBS_WS_PORT=21118
HBBR_HOST=your-rustdesk-server.com   # relay
HBBR_WS_PORT=21119
SERVER_KEY=<the base64 key printed by hbbs on first run>
GATEWAY_PORT=4000
```

Optional captcha (`gateway/.env.example` has the placeholders):
`CAPTCHA_ENABLED=true`, `HCAPTCHA_SITE_KEY`, `HCAPTCHA_SECRET_KEY`.

Never commit `.env` — it is in `.gitignore` along with `**/.env`; only the
`*.env.example` files are tracked.

---

## 3. Run both dev servers

Two terminals:

```bash
# terminal 1
cd gateway && npm run dev      # ts-node-dev --respawn --transpile-only src/server.ts
```

The gateway logs `[gateway] Listening on port 4000 (captcha=false)` and serves
`GET /config`:

```bash
curl http://localhost:4000/config
# {"captchaEnabled":false,"hcaptchaSiteKey":""}
```

```bash
# terminal 2
cd web && npm run dev          # vite, prints http://localhost:5173
```

Open <http://localhost:5173>.

### What the Vite dev server does with `/ws` and `/config`

From `web/vite.config.ts`, only **one** proxy is configured:

```ts
server: {
  proxy: {
    '/ws': { target: 'ws://localhost:4000', ws: true, rewriteWsOrigin: true },
  },
}
```

- **`/ws`** — proxied to `ws://localhost:4000`, WebSocket upgrades included
  (`ws: true`), and the `Origin` header is rewritten to the target
  (`rewriteWsOrigin`). This is the gateway socket the app opens
  (`GATEWAY_WS_URL = '/ws'` in `web/src/hooks/useGateway.ts`). It works out of
  the box at `localhost:5173`.
- **`/config`** — **not proxied.** The request goes to the Vite dev server, which
  answers the SPA (`index.html`, status 200). `ConnectForm`'s
  `fetch('/config').then(r => r.json())` then throws on parsing and the
  `.catch` sets `{ captchaEnabled: false, hcaptchaSiteKey: '' }`. So locally the
  captcha widget never renders, even if the gateway has captcha enabled.

If you need to test captcha locally, add the proxy yourself:

```ts
// web/vite.config.ts, inside server.proxy
'/config': { target: 'http://localhost:4000', changeOrigin: true },
```

That is a config change in `web/`, not part of the default setup.

---

## 4. Checks

There is a root `package.json` with no dependencies that drives both packages, so
from the repository root:

```bash
npm run install:all   # npm ci in gateway/ then web/
npm run typecheck     # tsc in both
npm run build         # tsc (gateway) + tsc -b && vite build (web)
npm test              # vitest in both
npm run lint          # eslint in both
```

Or run them per package (`cd gateway && npm test`). The same commands run in CI on
every pull request and on `main` (`.github/workflows/ci.yml`), in this order:
lint → typecheck → test → build.

| Command | State today |
|---|---|
| `npm run build` | Passes in both packages. |
| `npm run typecheck` | Passes in both. |
| `npm test` | Passes: 24 tests in `gateway/`, 25 in `web/`. |
| `gateway` lint | Passes (`eslint` is a devDependency there now). |
| `web` lint | **Fails** on four `react-hooks` errors: `RemoteScreen.tsx` writes three refs during render, `ConnectForm.tsx` calls `setCaptchaToken` inside an effect. This is the one red check in CI; it is tracked, not hidden. |

### What the tests cover

- **gateway/** (`vitest`, node): the password hash and nonce construction, the
  sequence counter's pre-increment behaviour, the browser frame header, protobuf
  round-trips and the key mapping (`gateway/src/utils/*.test.ts`).
- **web/** (`vitest` + `jsdom`): frame parsing and codec strings, the
  `localStorage` keys and server-config normalisation, the Remember-password rules,
  and the friendly-error mapping (`web/src/**/*.test.ts`).

None of them need a RustDesk host. What they cannot do is prove a real session
works — see below.

### What works without a RustDesk host

The gateway starts, `/config` answers and the browser UI loads with no relay at
all. A **connect** needs a reachable RustDesk host on the configured relay: with
none, `performRendezvous` retries an OFFLINE answer three times and then fails
with `Peer not available: OFFLINE — make sure the RustDesk app is running and
connected to your server`, which the UI shows as a connect error.

So changes to the protocol layer (`session.ts`, `rendezvous.ts`, `relay.ts`,
`keymap.ts`) can only be verified end to end against a host machine running
RustDesk with a reachable relay. The unit tests pin the pure parts (hashing,
framing, key mapping); the session itself still needs the real thing. A fake
RustDesk host is the plan for closing that gap.

---

## 5. Local image builds

Both compose files build from the same two Dockerfiles:

```bash
# build and run from source
docker compose -f docker-compose.yml build
docker compose -f docker-compose.yml up -d

# pre-built images published by CI
docker compose -f docker-compose.prod.yml up -d
```

`docker-compose.yml` builds `gateway/` and `web/`; `docker-compose.prod.yml` pulls
`ghcr.io/linkzy/rclient-gateway:latest` and `ghcr.io/linkzy/rclient-web:latest`.
In both, the gateway has no published port and `web` is published on
`${WEB_PORT:-80}`; nginx inside `web` proxies `/ws` and `/config` to
`gateway:4000` (`web/nginx.conf`).

For a local build with the UI on a different host port:

```bash
WEB_PORT=8080 docker compose -f docker-compose.yml up -d --build
# http://localhost:8080
```

---

## 6. Branches and commits

- **`main`** is the only long-lived branch. Work happens on short-lived branches
  and comes back as a pull request.
- Commit subjects in the history are imperative and conventional-commit style,
  with a scope when it helps:

  ```
  feat(R-06): fit-to-window / 1:1 native resolution toggle
  fix(keyboard): use unicode field for text input, fixing caps-lock and layout bugs
  docs: update task list, known issues, and disable keystroke logging
  feat: add show debug info checkbox to advanced options
  ```

  `feat(...)` / `fix(...)` / `docs(...)` / `docs`, optionally followed by a
  roadmap id (`R-03`, `R-09`) or an area (`ui`, `mouse`, `keyboard`, `deploy`).
- Keep `.env`, keys and server addresses out of commits — see the ignored paths
  above and the privacy notes in `../README.md`.

---

## See also

| File | Why |
|---|---|
| [`README.md`](./README.md) | Index of all documentation |
| [`../AGENTS.md`](../AGENTS.md) | Short orientation for AI agents |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Design, gateway API, limitations |
| [`PROTOCOL.md`](./PROTOCOL.md) | RustDesk protocol details |
| [`TASKS.md`](./TASKS.md) | What is done and what is next |
| [`../deploy/DEMO.md`](../deploy/DEMO.md) | The public demo instance (separate host) |
