# Documentation

Everything about rclient, for humans first. (AI agents may want
[`../AGENTS.md`](../AGENTS.md) — it is the same material, condensed for a
fresh context.)

## Read this if you want to…

| I want to… | Start here |
|---|---|
| **Deploy it** on my own server | [`../README.md`](../README.md) — Requirements and the five-step setup guide (`docker-compose.yml` builds from source, `docker-compose.prod.yml` runs the published images) |
| **Try it** without installing anything | the public demo, <https://rclient-demo.linkzy.dev> — see [`../deploy/DEMO.md`](../deploy/DEMO.md) |
| **Run it locally** and change code | [`DEVELOPMENT.md`](./DEVELOPMENT.md) — Node 22, `npm ci` in both packages, the gateway `.env`, both dev servers, what the Vite proxy does |
| **Contribute** a fix or feature | [`../CONTRIBUTING.md`](../CONTRIBUTING.md) and the open issues labelled `good first issue` / `help wanted` |
| **Understand how it works** | [`ARCHITECTURE.md`](./ARCHITECTURE.md) — components, the browser↔gateway API, the connection lifecycle, limitations |
| **Work on the protocol** | [`PROTOCOL.md`](./PROTOCOL.md) — framing, handshake, encryption, video/audio/input messages |
| **Know what is finished** | [`TASKS.md`](./TASKS.md) — milestone roadmap; [`issues/`](./issues/) has the ready-to-paste issues |
| **Check a bug I hit** | [`KNOWN_ISSUES.md`](./KNOWN_ISSUES.md) — confirmed bugs, root causes, fixed ones included |
| **Point an AI agent at the repo** | [`../AGENTS.md`](../AGENTS.md) |
| **Run the public demo** | [`../deploy/DEMO.md`](../deploy/DEMO.md) — its host, tunnel, redeploy and limits |

## The files

| File | What it is |
|---|---|
| [`../README.md`](../README.md) | The front door: what rclient is, requirements, full setup guide, environment variables, privacy, limitations. |
| [`../AGENTS.md`](../AGENTS.md) | Two-page orientation: the two packages, commands, the four protocol pitfalls that break sessions silently. |
| [`DEVELOPMENT.md`](./DEVELOPMENT.md) | Local setup without Docker, the Vite proxy reality, checks that pass and fail, image builds, commit conventions. |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Diagram and component responsibilities, the full gateway WebSocket API (`/config`, `ping`/`pong`, `gw_stats`, `audio_format`, binary frame markers), captcha and per-connection server overrides, connection lifecycle, deployment, security, known limitations. |
| [`PROTOCOL.md`](./PROTOCOL.md) | RustDesk protocol reference: ports, proto files, wire framing, rendezvous with `force_relay`, the secure handshake, password hashing, video and audio frames, input events. |
| [`TASKS.md`](./TASKS.md) | Completed phases, the milestone roadmap, and the good-first-issue set. |
| [`issues/`](./issues/) | Ready-to-paste GitHub issues and the pinned roadmap post, with publishing order. |
| [`KNOWN_ISSUES.md`](./KNOWN_ISSUES.md) | Each confirmed bug with symptoms, root cause and the fix (or the next steps when open). |
| [`AI_GUIDELINES.md`](./AI_GUIDELINES.md) | Conventions, environment variables, design decisions and 13 protocol pitfalls. Overlaps `../AGENTS.md`; this one goes deeper. |
| [`../deploy/DEMO.md`](../deploy/DEMO.md) | The public demo instance: host snapshot, architecture, deployment, redeploy, limits and the public-relay caveat. |

## Conventions in this folder

- Claims here describe the code in this repository. When a document and the code
  disagree, the code wins and the document is the bug.
- Statuses are kept in sync: an issue marked fixed in `TASKS.md` must say the
  same in `KNOWN_ISSUES.md`.
- No server addresses, keys or credentials. Deployments keep them in their own
  `.env`.
