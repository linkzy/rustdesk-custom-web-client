# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The versions here are rclient's own, not RustDesk's. The gateway identifies itself
to a RustDesk host with a protocol version string in `gateway/src/session.ts`
(`LoginRequest.version`, currently `1.3.8`); that string is not this project's
version and is deliberately not touched by a release.

## [Unreleased]

Nothing yet.

## [0.2.0] — 2026-11-19

"Community-ready": the release where a stranger can read the repo, trust what it
says, run the checks, and find something to pick up. Everything below landed
after 0.1.1, which was the last tag before this one.

### Added

- **Audio (Opus).** The host's audio stream is decoded with WebCodecs
  `AudioDecoder` and played through Web Audio; the gateway forwards it as a
  separate binary frame marker and announces the format over the WebSocket
  (`audio_format`). Where the browser lacks `AudioDecoder`/`AudioContext`, video
  and input keep working and audio is skipped.
- **Fit-to-window / 1:1** resolution toggle, and a **fullscreen** mode that hides
  the toolbar.
- **Optional hCaptcha** on the connect form, verified server side against the
  hCaptcha API.
- **User-configurable relay server** through Advanced Options (hbbs/hbbr host and
  server key); `GET /config` tells the browser whether captcha is on.
- **"Show debug info"** checkbox, and a test suite in both packages: Vitest with
  49 tests (24 gateway, 25 web) covering crypto, framing, key mapping, protobuf round-trips, password storage, error mapping, server-config parsing and the frame protocol.
- **CI on every pull request and on `main`.** `.github/workflows/ci.yml` runs two
  jobs, `gateway` and `web`, each doing `npm ci` → lint → typecheck → test →
  build on Node 22 with npm caching. A pull request now shows a check before it
  can be merged; `main` is checked on every push.
- **Dependabot.** Weekly grouped minor/patch updates for npm in the root,
  `gateway/` and `web/`, and for GitHub Actions.
- **ESLint for the gateway.** `gateway/eslint.config.mjs` (typescript-eslint flat
  config, Node globals), so `npm run lint` works there for the first time.
- **Community files:** MIT `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`,
  `SECURITY.md`, issue forms and a pull request template.
- **Developer documentation:** `docs/DEVELOPMENT.md` (local setup without Docker,
  the Vite proxy, the checks that pass, image builds), a rewritten `docs/README.md`
  index, and `AGENTS.md` for AI agents.
- **Roadmap and issues.** `docs/TASKS.md` gains milestone sections (0.2.0–0.4.0)
  with `good first issue` / `help wanted` labels, and `docs/issues/` holds
  ready-to-paste issues.
- **Public demo instance** at <https://rclient-demo.linkzy.dev>, separate from the
  author's personal deployment; its relay, tunnel, redeploy path and limits are in
  `deploy/DEMO.md`.
- **First-run polish:** real page title, meta/Open Graph tags, a web app manifest,
  friendlier connection errors with the technical text kept in the Debug Panel, and
  accessibility labels on the connect form.
- `.nvmrc` (Node 22), a root `engines` field, and `.editorconfig`.

### Changed

- **The password is no longer stored by default.** Saving it to `localStorage`
  now requires the "Remember password" checkbox (off by default), and the value is
  written only after a connection has succeeded
  (`web/src/utils/passwordStorage.ts`). Before this release the form saved the
  password as soon as it was submitted. On upgrade, a password left behind by an
  earlier version is dropped unless the user opts in.
- **Documentation describes what the code does.** The README, `docs/TASKS.md` and
  `docs/KNOWN_ISSUES.md` were corrected where they claimed behaviour the code does
  not have; the privacy section now spells out what the gateway logs and that the
  hosted instance carries Cloudflare Web Analytics.
- The README is a landing page: what the project is, requirements, a five-step
  setup guide, environment variables, performance, limitations, roadmap, privacy
  and how to contribute.

### Fixed

- Four pre-existing `react-hooks` lint errors, fixed in code rather than
  suppressed: `RemoteScreen.tsx` no longer writes refs during render (they are
  synced from an effect declared before the listener effects), and
  `ConnectForm.tsx` resets the hCaptcha widget from `handleSubmit` instead of
  calling `setState` inside an effect.

## [0.1.1] — 2026-05-18

### Added

- The device ID and the Advanced options were persisted in `localStorage`, so a
  revisit did not mean retyping them. The same commit also stored the password;
  that part was replaced in 0.2.0 by the opt-in described above.

### Fixed

- **KI-005 — keyboard input:** text is sent in the unicode field, so caps lock and
  non-US layouts no longer produce wrong characters, and unicode key-up events no
  longer cause double input (`c78b528`, `543054c`).
- **KI-004 — mouse wheel:** scroll direction inverted to match RustDesk's
  convention (`7c75213`).

## [0.1.0] — 2026-05-15

First released state of the working client: a browser session to a RustDesk host
through a self-hosted relay, at a usable frame rate.

### Added

- **Video** over WebCodecs `VideoDecoder`, drawn to a canvas, with a stats overlay
  (FPS, decode time, frame interval, gateway FPS) and a debug log panel.
- **Input:** mouse move/down/up/wheel and full keyboard forwarding, captured with
  native DOM listeners, plus modifier handling and a RustDesk-compatible key map.
- **Gateway:** rendezvous with `hbbs` (punch hole, `RequestRelay`), relay to
  `hbbr`, the Curve25519 handshake and Salsa20 session encryption, password
  hashing, and one relay connection per browser WebSocket.
- **Docker images** for gateway and web published to GHCR, a from-source
  `docker-compose.yml` and a `docker-compose.prod.yml`, with `linux/amd64` and
  `linux/arm64` builds.

### Fixed

- **KI-001 — sessions dropped after ~10 seconds:** the host's `TestDelay`
  keepalive is echoed with `from_client: false`, and the `int64` time is converted
  before re-encoding (`3424a01`, `955cf68`).
- **Frame rate stuck near 2 FPS:** `video_ack_required` is `false`, a
  `video_received` ack is sent once, and 30 FPS is requested at login and again
  after `PeerInfo`.
- Input encoding: correct mouse/keyboard protocol fields and pointer capture
  (`1a4cc69`, `4d6b5da`, `be304f3`).

## [0.1.0-beta] — 2026-05-14

First working implementation: connect to a RustDesk host from the browser and
control it. No audio, and several protocol details were still wrong (all fixed
before 0.1.0).

[Unreleased]: https://github.com/linkzy/rustdesk-custom-web-client/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/linkzy/rustdesk-custom-web-client/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/linkzy/rustdesk-custom-web-client/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/linkzy/rustdesk-custom-web-client/compare/v0.1.0-beta...v0.1.0
[0.1.0-beta]: https://github.com/linkzy/rustdesk-custom-web-client/releases/tag/v0.1.0-beta
