# Development — running rclient locally

How to run both packages on your machine without Docker, what the checks are, and
the conventions the history uses. Every command here was run on this repository's
code; where something does not work, that is said plainly.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Node.js 22+ | Both `Dockerfile`s build on `node:22-alpine`. No `engines` field or `.nvmrc` pins it — 22 is the version the images use. |
| npm | Lockfiles exist in both packages, so `npm ci` works. |
| A RustDesk host + relay | Only needed to exercise a real session (see [What works without a RustDesk host](#what-works-without-a-rustdesk-host)). |

Docker is optional: it is only needed for the local image builds at the bottom.

---

## 1. Install

```bash
cd gateway && npm ci
cd ../web && npm ci
```

Each package has its own `package-lock.json`; there is no workspace root.

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

| Command | State |
|---|---|
| `cd gateway && npm run build` | Passes (`tsc` → `dist/`). |
| `cd gateway && npm run lint` | Passes. `gateway/eslint.config.mjs` is a typescript-eslint flat config with Node globals. |
| `cd gateway && npm run typecheck` | Passes (`tsc -p tsconfig.typecheck.json`, includes the tests). |
| `cd web && npm run build` | Passes (`tsc -b && vite build` → `dist/`). |
| `cd web && npm run lint` | Passes. |
| `cd web && npm run typecheck` | Passes (`tsc -b`). |

All six run in CI on every pull request and on `main`
(`.github/workflows/ci.yml`), together with the tests.

### Tests

Both packages use [Vitest](https://vitest.dev/): 24 tests in `gateway/`
(crypto, framing, key mapping, protobuf round-trips) and 25 in `web/`
(password storage, error mapping, server-config parsing, the frame protocol — in
`jsdom`).

```bash
npm test                 # both packages, from the repo root
npm run test:gateway     # or one at a time
npm run test:web
```

There is also a manual protobuf round-trip you can run on its own:

```bash
cd gateway
npx ts-node-dev --transpile-only src/utils/proto.test.ts
# … [test] Round-trip OK ✅
```

It loads `gateway/src/proto/*.proto`, encodes a `PunchHoleRequest`, decodes it and
asserts the fields survive.

### What works without a RustDesk host

The gateway starts, `/config` answers and the browser UI loads with no relay at
all. A **connect** needs a reachable RustDesk host on the configured relay: with
none, `performRendezvous` retries an OFFLINE answer three times and then fails
with `Peer not available: OFFLINE — make sure the RustDesk app is running and
connected to your server`, which the UI shows as a connect error.

So changes to the protocol layer (`session.ts`, `rendezvous.ts`, `relay.ts`,
`keymap.ts`) cannot be verified end to end from a bare clone: they need a host
machine running RustDesk with a reachable relay. The plan for removing that
dependency is a fake RustDesk host with a unit-test suite.

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
