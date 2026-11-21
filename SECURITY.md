# Security Policy

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Use GitHub's private reporting flow:
[**Report a vulnerability**](https://github.com/linkzy/rustdesk-custom-web-client/security/advisories/new).

That creates a private advisory only the maintainer can see. Include what you
found, how to reproduce it, and what an attacker could do with it. If the issue
is already public elsewhere, say so — it changes how fast this has to move.

You can expect an acknowledgement, an honest assessment of whether it is a real
issue, and credit in the advisory if you want it. There is no bug bounty; this is
a small self-hosted project.

## What is in scope

- `gateway/` — the Node.js service: RustDesk protocol handling, session
  encryption, the browser WebSocket and `/config`.
- `web/` — the React frontend: WebCodecs decoding, input capture, and the
  browser-side storage in `web/src/utils/passwordStorage.ts`.
- `docker-compose.yml`, `docker-compose.prod.yml`, `web/nginx.conf`,
  `gateway/Dockerfile`, `web/Dockerfile`.
- `deploy/` — the public demo stack.

## Threat model

Read this before deciding something is a vulnerability; several behaviours are
deliberate.

### The gateway holds the RustDesk session keys

The RustDesk secure handshake (Curve25519 + XSalsa20-Poly1305 via `tweetnacl`)
happens **in the gateway** (`gateway/src/session.ts`). The browser receives
plaintext video/audio frames and sends plaintext input, because browsers cannot
speak the RustDesk session protocol.

Consequences:

- **The gateway port (4000) must never be public.** Anyone who can open a
  WebSocket to it can try to connect to machines through your relay. Both compose
  files `expose` it only, and nginx proxies `/ws` on the same origin as the UI.
  Exposing port 4000 to the internet is a misconfiguration, not a bug.
- **The gateway is trusted.** Whoever operates it can observe decoded video and
  injected input for sessions it serves. Self-host it, or trust the operator — the
  same trust model as any remote-desktop relay.

### HTTPS is required

Browsers only expose WebCodecs in a secure context, so the page must be served
over HTTPS (or `localhost`). It also protects the RustDesk password in transit
from the browser to the gateway. Running it over plain HTTP on a public address is
a misconfiguration; the project does not add a fallback for it.

### Passwords

- The password is sent from the browser to the gateway over that HTTPS WebSocket,
  hashed in the gateway (`SHA256(SHA256(password + salt) + challenge)`) and only
  the hash goes to the remote machine.
- The gateway does not write the password to disk and does not log it. It logs
  connection events (target ID, relay addresses, handshake stages, frame stats).
  A verbose keystroke log exists in `gateway/src/server.ts` but is commented out;
  if an operator re-enables it, keystrokes are logged.
- The browser stores the password in `localStorage` **only when the user ticks
  "Remember password"**, and only after a successful connection. Unticked, no
  password is persisted and any previously saved one is deleted. This is an
  explicit user choice about their own browser, not a server-side secret store.
- A leaked password is a leaked password: it is the RustDesk connection password
  for that machine. Rotate it in RustDesk.

### The relay key and environment variables are the user's own

`SERVER_KEY`, the relay hosts, and any hCaptcha keys live in the deployment's
`.env` (git-ignored; only `*.env.example` placeholders are committed). The
repository ships no keys and no server addresses.

The public demo runs its own RustDesk relay (`hbbs`/`hbbr`) with its own generated
key pair. Only the **public** half is shown to visitors — they need it to point
their RustDesk at the demo's relay — and the private half stays on the demo host,
outside this repository. Neither key is committed here.

### Captcha is rate-limiting, not authentication

`CAPTCHA_ENABLED` requires an hCaptcha token before a `connect` message is
processed, verified server-side against `HCAPTCHA_SECRET_KEY`. It slows abuse; it
does not authenticate anyone and does not protect the remote machine — the
RustDesk password does that.

### What the project does not claim

- No audit has been performed. No formal security review of the protocol code
  exists.
- There is no guarantee about RustDesk's own servers or the relay you point it at.
- The frontend adds no analytics of its own. If you host rclient behind
  Cloudflare, its Web Analytics beacon may be injected into the page by the
  deployment; a self-hosted deployment does not get it from this repository.

## Supported versions

The project is pre-1.0. Fixes land on `main`; there are no maintained release
branches yet. If you run a fork, track `main` for security fixes.
