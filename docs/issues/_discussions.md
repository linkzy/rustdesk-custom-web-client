# Roadmap & how to help

> Draft for a **pinned Discussion** (category: General, or "Announcements" if
> the repo has one). Publish it after the milestones exist so the links resolve.

## What this is

rclient is a self-hosted web client for [RustDesk](https://rustdesk.com/): a
browser page that connects through **your own** relay to a machine running the
RustDesk host app. No install on the controlling side, no account, no analytics
added by the project.

- Try it: <https://rclient-demo.linkzy.dev> — a separate demo instance, currently
  pointing at RustDesk's public servers. See the caveat below before judging it.
- Read: [`docs/README.md`](https://github.com/linkzy/rustdesk-custom-web-client/blob/main/docs/README.md)
  routes every kind of reader to the right page.
- Deploy your own: the README's setup guide.

**Honest status.** Video, input and audio work against a self-hosted relay. The
public demo routes through RustDesk's shared servers, and their relay ports were
refusing connections when it was deployed — the ID server answers, the relay did
not. Until that is resolved the demo is labelled *degraded*: it may fail with
"connected, waiting for image". Your own relay is the path that is actually
verified. The full evidence is in
[`deploy/DEMO.md`](https://github.com/linkzy/rustdesk-custom-web-client/blob/main/deploy/DEMO.md).

## What is planned

Three milestones, all tracked as issues and in
[`docs/TASKS.md`](https://github.com/linkzy/rustdesk-custom-web-client/blob/main/docs/TASKS.md):

- **v0.2.0 — Community-ready.** Everything a stranger needs to trust and try the
  repo: log rotation, memory limits and healthchecks in the shipped compose files,
  structured logging, firewall and reverse-proxy guidance, friendlier errors,
  audio mute/volume, a shortcut help overlay, screenshots.
- **v0.3.0 — Everyday remote desktop.** Reconnect after a network drop, saved
  hosts, clipboard sync, forwarded shortcuts, mobile keyboard.
- **v0.4.0 — Bigger features.** File transfer, multi-monitor, i18n, themes.

Seven issues across the roadmap are marked **good first issue** — small,
self-contained, and testable without a RustDesk host. Six of them are in v0.2.0.

## How to claim an issue

1. Find one labelled
   [`good first issue`](https://github.com/linkzy/rustdesk-custom-web-client/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
   or [`help wanted`](https://github.com/linkzy/rustdesk-custom-web-client/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22).
2. **Comment on the issue** saying you are taking it. That is the claim; it stops
   duplicate work. If you go quiet for a week the claim can be released again —
   say if you need longer.
3. Read [`CONTRIBUTING.md`](https://github.com/linkzy/rustdesk-custom-web-client/blob/main/CONTRIBUTING.md)
   and [`docs/DEVELOPMENT.md`](https://github.com/linkzy/rustdesk-custom-web-client/blob/main/docs/DEVELOPMENT.md).
4. Open a PR that links the issue (`Closes #12`).

AI-assisted contributions are welcome; you are responsible for what you submit.

## Where to ask

- **Questions and setup help** — Discussions → Q&A.
- **Ideas and feature discussion** — Discussions → Ideas, before opening a
  feature request.
- **Bugs** — the issue template, with the browser, host OS, RustDesk version and
  relay type filled in.
- **Security** — never here; use [`SECURITY.md`](https://github.com/linkzy/rustdesk-custom-web-client/blob/main/SECURITY.md).

The best way to help right now is not a big feature: it is trying your own relay
and telling us what broke.
