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
| `npm run lint` | Passes in both packages. |
| `npm run typecheck` | Passes in both. |
| `npm test` | Passes: the full suite in both (currently 50 in `gateway/`, 97 in `web/`). |
| `npm run build` | Passes in both packages. |
| `npm run test:e2e` | Passes: 5 Playwright scenarios (needs the browser install below). |

### What the tests cover

- **gateway/** (`vitest`, node): the password hash and nonce construction, the
  sequence counter's pre-increment behaviour, the browser frame header, protobuf
  round-trips and the key mapping (`gateway/src/utils/*.test.ts`).
- **web/** (`vitest` + `jsdom`): frame parsing and codec strings, the
  `localStorage` keys and server-config normalisation, the Remember-password rules,
  the friendly-error mapping, and the i18n catalogues (`web/src/**/*.test.ts`).
- **e2e/** (Playwright, real Chromium): a whole session against the fake RustDesk
  host — video that keeps changing, a click arriving at the right coordinates,
  typing arriving as unicode, and the two friendly error messages.

Unit tests are deliberately pure: they never launch a browser or open a socket
that outlives the process.

---

## End-to-end tests (Playwright)

The unit tests pin the pure parts. The end-to-end suite is what proves the
product works: it starts a **fake RustDesk host**, a gateway and the built web
app, then drives a real browser through a whole session.

```bash
npx playwright install chromium   # once; ~124 MB, not repeated per run
npm run test:e2e
```

`npm run test:e2e` runs `playwright test --config e2e/playwright.config.mjs`.
The config lives in `e2e/`, so the `--config` flag is required; running plain
`npx playwright test` from the root would also walk `gateway/` and `web/` and try
to run the vitest suites with the wrong runner. The config's `testMatch` is
narrowed to `e2e/specs/*.spec.mjs` for the same reason.

There is no relay and no real machine involved. `e2e/stack.mjs` starts everything
on OS-assigned ports and `e2e/serve.mjs` serves `web/dist` while proxying `/ws`
and `/config` to the gateway, so two runs never collide.

### The five scenarios

| Spec | What it proves |
|---|---|
| `specs/session.spec.mjs` | connects and streams video that keeps changing (canvas pixels sampled twice) |
| | a click reaches the machine at the coordinates clicked (`/fake/events`, mask 9 = left down) |
| | typing arrives as key events (unicode 97 and 98) |
| `specs/failures.spec.mjs` | a wrong password shows the friendly message |
| | an unknown ID says the machine is offline |

### Writing a new test

Add a `*.spec.mjs` under `e2e/specs/` and import from `./fixtures.mjs`:

```js
import { test, expect, connect } from './fixtures.mjs';

test('my scenario', async ({ page, stack }) => {
  await connect(page, { id: stack.fakeHost.id, password: stack.fakeHost.password });
  // ...
});
```

- The `stack` fixture is one stack per worker, torn down in a `finally` — do not
  start your own servers.
- Assert on things a user gets, not on internals. `stack.control` exposes the
  fake host's own state: `waitForFrames(n)`, `events('mouse')`, `events('key')`,
  `clearEvents()`, `state()`.
- Select elements by **id** (`#rclient-device-id`) or role, not by translated
  label text or CSS module class names: the labels change with the locale.
- Wait on real state rather than sleeping. `expect.poll` and
  `stack.control.waitForFrames` both do this.

### Reading a failing run

A failure writes everything you need to `e2e/.artifacts/` (gitignored):

```
e2e/.artifacts/
  html-report/index.html          # open it in a browser: the whole run
  test-results/<test-name>/       # one directory per failed test
    trace.zip                     # the timeline
    test-failed-1.png             # the page at the moment it broke
    video.webm                    # the whole test, watchable
    error-context.md              # the error plus an accessibility snapshot
```

To open a trace:

```bash
npx playwright show-trace e2e/.artifacts/test-results/<test-name>/trace.zip
```

A trace is not just a log: it holds a DOM snapshot per action, the network log,
the console, the source line of each step, and a screencast. You can click any
action and see the page as it was.

The report server is never left running: the config uses `open: 'never'`, so
`index.html` is written and the process exits.

### In CI

The `e2e` job in `.github/workflows/ci.yml` starts the fake host, the gateway and
`e2e/serve.mjs` as background services with health checks, then runs Playwright
with `E2E_EXTERNAL=1` so the fixture attaches to those services instead of
starting its own. It installs Chromium only (`npx playwright install --with-deps
chromium`) and uploads `e2e/.artifacts` and the service logs on failure.

---

## What works without a rustdesk host

With `gateway/test/fake-host/` running, everything does: it stands in for a
RustDesk host and its relay pair, so a session can be exercised without a real
machine. `npm run fake-host` in `gateway/` starts it; see
`gateway/test/fake-host/README.md`.

Without it, the gateway still starts, `/config` answers and the UI loads, but a
**connect** needs a reachable host: `performRendezvous` retries an OFFLINE answer
three times and then fails with `Peer not available: OFFLINE — make sure the
RustDesk app is running and connected to your server`, which the UI shows as the
friendly "That machine is offline" message.

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

## The README demo and how to regenerate it

There are two things worth knowing, and they are not the same.

**`docs/assets/demo.gif` — the README hero: a real session.** Recorded by the
maintainer on the demo relay against a throwaway test host (a clock and a plain
shell), with the browser app driving it: connect, then typed text landing in the
remote terminal. It is **not regenerable by a script** — it needs a live session
and a machine to drive, and it was captured and frame-checked by hand. If it needs
replacing, do the same: record, then check frame by frame that no real machine ID,
hostname or window content is legible before committing it.

**A reproducible synthetic clip — generated into a temp directory.** One command:

```bash
npm run record:demo        # same as: node e2e/record-demo.mjs
```

It starts the fake RustDesk host, the gateway and the Vite dev server on ephemeral
ports (`e2e/stack.mjs`), drives Chrome over the DevTools protocol through the whole
flow — connect form, typing the ID and password, connecting, the fake host's
session, a mouse move, a short typing burst — captures every painted frame with
`Page.startScreencast`, and encodes them with `ffmpeg` to
`demo-synthetic.gif` + `demo-synthetic.png` **in the system temp directory**
(`--out <path>` to choose). It never writes into the repository: running it can
never overwrite the real hero or add a second GIF.

- **Deterministic in substance, not frame-for-frame.** Every run shows the same
  steps and the same "25 key events received" figure; the frame count varies by a
  few because the capture follows real paints (≈10 s, 150–170 frames).
- **Synthetic by design**, and a badge in every frame says so. It is a test
  pattern, not a desktop; if you ever use it as a hero, say so in the caption.
- **Needs** Chrome or Edge (set `E2E_CHROME_PATH` if it is not in a standard
- **Needs** Chrome or Edge (set `E2E_CHROME_PATH` if it is not in a standard
  location) and `ffmpeg` on `PATH`. The end-to-end suite is separate: it uses
  Playwright's own Chromium (`npx playwright install chromium`) and does not
  launch a system browser, so the recorder and the suite share no browser setup.
- **Stays on the DevTools protocol, not Playwright, on purpose.** The recorder
  needs `Page.startScreencast` — a stream of the painted frames — and then
  encodes them to a GIF. Playwright is built for assertions and traces, not for
  capturing every paint as an image sequence, and its video recording is a
  fixed-rate WebM that would have to be re-decoded anyway. The e2e *suite* is
  Playwright; this one script is not, and that is deliberate rather than an
  oversight. `npm run record:demo` runs it.
- `--out <path-without-extension>` writes somewhere else, e.g.
  `--out /tmp/demo` for a throwaway copy.
- Keep the real hero under ~2 MB; it is 270 KB today, and the synthetic clip is
  ~0.2 MB at 960×600, 15 fps, ~10 s.
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
