# Roadmap & how to help

> Draft for a **pinned Discussion** (category: General, or "Announcements" if
> the repo has one). Publish it after the milestones exist so the links resolve.

## What this is

rclient is a self-hosted web client for [RustDesk](https://rustdesk.com/): a
browser page that connects through **your own** relay to a machine running the
RustDesk host app. No install on the controlling side, no account, no analytics
added by the project.

- Try it: <https://rclient-demo.linkzy.dev> — a separate demo instance with its own
  relay. Before you connect, point your RustDesk host at that relay (see the status
  below).
- Read: [`docs/README.md`](https://github.com/linkzy/rustdesk-custom-web-client/blob/main/docs/README.md)
  routes every kind of reader to the right page.
- Deploy your own: the README's setup guide.

**Honest status.** Video, input and audio work against a self-hosted relay, and
that is still the path vouched for end to end. The public demo now runs its **own**
relay pair (hbbs+hbbr) on the DNS-only hostname `relay-demo.linkzy.dev`, because
RustDesk's shared relay ports were refusing connections from its host. The relay is
verified at protocol level — ports reachable, key enforced, peers pairing through
hbbr — but a full session from a real RustDesk host to the browser is **not** proven
yet, so treat the demo as "should work, unproven".

**To try the demo:** in RustDesk on the machine you want to control, set **ID
Server** to `relay-demo.linkzy.dev` and paste the demo key shown on the demo page;
leave Relay/API server blank. Then enter that machine's ID and password in the
browser. A machine still pointing at RustDesk's public servers will not be found —
they are separate networks. Evidence and key rotation:
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
