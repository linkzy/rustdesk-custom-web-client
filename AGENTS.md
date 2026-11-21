# AGENTS.md

Short entry point for AI agents and new contributors. The depth lives in [`docs/`](./docs/) — this file only tells you where to start and what bites.

## What this is

`rclient` is a self-hosted **web client for RustDesk**: a browser page that connects to a machine running the RustDesk host app through *your own* RustDesk relay (`hbbs`/`hbbr`), with no app to install on the controlling side.

Two packages plus compose files:

| Path | What it is |
|---|---|
| `gateway/` | Node.js/TypeScript service. Speaks the RustDesk binary protocol, owns session encryption, exposes one WebSocket + `GET /config` to the browser. |
| `web/` | React/TypeScript frontend. WebCodecs video (`VideoDecoder`) and audio (`AudioDecoder`), canvas rendering, input capture. |
| `docker-compose.yml` | Builds both packages locally. |
| `docker-compose.prod.yml` | Runs the published `ghcr.io` images. |
| `docs/` | Protocol, architecture, task list, known issues. |

The RustDesk relay itself is **not** in this repo.

## Commands

```bash
# from the repo root (its only dependency is @playwright/test, for the e2e suite)
npm run install:all   # npm ci in gateway/ then web/
npm test              # vitest in both: 50 gateway + 97 web
npm run typecheck     # tsc in both
npm run lint          # eslint in both
npm run build         # both
npm run test:e2e      # Playwright against the fake host (needs: npx playwright install chromium)
npm run record:demo   # re-record the README GIF (CDP, not Playwright)

# gateway alone
cd gateway && npm ci
npm run dev        # ts-node-dev, watches src/
npm run build      # tsc → dist/
npm run start      # node dist/server.js
npm test           # vitest (node env)
npm run lint       # eslint src --ext .ts
npm run typecheck  # tsc -p tsconfig.typecheck.json

# web alone
cd web && npm ci
npm run dev        # Vite on :5173, proxies /ws → ws://localhost:4000
npm run build      # tsc -b && vite build
npm test           # vitest + jsdom
npm run lint       # eslint .
npm run typecheck  # tsc -b

# whole stack
docker compose up -d              # from source
docker compose -f docker-compose.prod.yml up -d   # prebuilt images
```

CI (`.github/workflows/ci.yml`) runs lint → typecheck → test → build on every pull
request and on `main`; all five checks pass today.

Node 22 is what the Dockerfiles, `.nvmrc` and CI use. `.env.example` and `gateway/.env.example` list every variable; ports and defaults are in the root README.

## Top protocol pitfalls

Read [`docs/AI_GUIDELINES.md`](./docs/AI_GUIDELINES.md) before touching `gateway/src/session.ts`. The four that break sessions silently:

1. **Pre-increment seqnums.** Encryption counters start at 0 and the first message uses seq 1 (`++seq`). Post-increment breaks every nonce.
2. **TestDelay echo direction.** The host sends `from_client: false`; echo it back with `from_client: false`, only when the incoming value is false. Echoing `true` pins FPS at the minimum.
3. **`video_ack_required: false`.** With `true` the host blocks on an ack per frame (≈2 FPS).
4. **Password hash order.** `SHA256(SHA256(password + salt) + challenge)`. Also: `LoginRequest.username` must be the target machine's ID, and protobuf `bytes` decoded as strings need `Buffer.from(str, 'binary')`.

## House rules

- The password may only be written to `localStorage` behind the "Remember password" opt-in, and only after a successful connection (`web/src/utils/passwordStorage.ts`). No secrets in logs.
- Never commit `.env` files, server addresses or keys.
- Verify before marking something done: run the checks — `npm test`, `npm run typecheck`, `npm run lint` and `npm run build` all pass today, and CI runs the same four on every PR. A traced run beats an assumption.

## Where to go next

| Need | File |
|---|---|
| Every doc, and what to read for what | [`docs/README.md`](./docs/README.md) |
| Local setup without Docker | [`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md) |
| Self-hosting (relay, HTTPS, troubleshooting) | [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) |
| Cutting a release | [`docs/RELEASING.md`](./docs/RELEASING.md) |
| Orientation, conventions, pitfalls | [`docs/AI_GUIDELINES.md`](./docs/AI_GUIDELINES.md) |
| System design, gateway WS API, limitations | [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) |
| RustDesk protocol details | [`docs/PROTOCOL.md`](./docs/PROTOCOL.md) |
| What to work on | [`docs/TASKS.md`](./docs/TASKS.md) |
| Open bugs | [`docs/KNOWN_ISSUES.md`](./docs/KNOWN_ISSUES.md) |
| The public demo (separate host) | [`deploy/DEMO.md`](./deploy/DEMO.md) |
| Setup and user-facing docs | [`README.md`](./README.md) |
