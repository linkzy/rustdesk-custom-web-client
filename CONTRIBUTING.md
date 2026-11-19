# Contributing to rclient

Thanks for wanting to help. rclient is a small, honest project: a browser client
for your own RustDesk relay. This page tells you where things are, what a good
report or patch looks like, and what we will and won't promise.

Not sure where to start? Read [`docs/README.md`](./docs/README.md) — it routes
each kind of reader to the right document — then pick something from
[`docs/TASKS.md`](./docs/TASKS.md).

---

## Ways to help

| You want to… | Do this |
|---|---|
| **Report a bug** | Open a [bug report](https://github.com/linkzy/rustdesk-custom-web-client/issues/new?template=bug_report.yml). Fill in the browser, host OS, RustDesk version and relay type — without them the report usually can't be reproduced. |
| **Ask a question** | Ask in [Discussions → Q&A](https://github.com/linkzy/rustdesk-custom-web-client/discussions). Please don't disguise a question as a bug report. |
| **Propose a feature** | Open a [feature request](https://github.com/linkzy/rustdesk-custom-web-client/issues/new?template=feature_request.yml) — or float the idea in [Discussions → Ideas](https://github.com/linkzy/rustdesk-custom-web-client/discussions) first if it is still rough. Say what problem it solves for you. |
| **Send a fix** | Find an open issue (start with [`good first issue`](https://github.com/linkzy/rustdesk-custom-web-client/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)), comment to claim it, then open a pull request. That avoids two people writing the same patch. |
| **Improve the docs** | Same as a fix — docs are code here, and wrong docs are treated as bugs. |
| **Share a setup** | A relay/host combination that works well (or badly) is useful context — post it in Discussions. |

Labels you will see: `bug`, `enhancement`, `documentation`, `question`,
`duplicate`, `invalid`, `wontfix`, plus the two entry points for newcomers —
`good first issue` and `help wanted`.

The roadmap lives in [`docs/TASKS.md`](./docs/TASKS.md) and each milestone is
published as GitHub issues and milestones. If an item there has no issue yet,
treat the table as current. Do not start a large feature without agreeing on it in
an issue first.

---

## Before you write code

1. **Get the project running.** [`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md)
   walks through both packages without Docker, the gateway `.env`, what the Vite
   dev server does with `/ws` and `/config`, and the checks. Allow ten minutes
   for the first install.
2. **Read the pitfalls.** [`docs/AI_GUIDELINES.md`](./docs/AI_GUIDELINES.md) lists
   13 protocol pitfalls; four of them (pre-increment seqnums, TestDelay echo
   direction, `video_ack_required: false`, password hash order) break sessions in
   ways that look like unrelated bugs. If you touch `gateway/src/session.ts`,
   read [`docs/KNOWN_ISSUES.md`](./docs/KNOWN_ISSUES.md) too.
3. **Check the state of the checks.** `npm run build` passes in both packages
   today. `npm run lint` in `web/` currently fails on four pre-existing
   `react-hooks` errors, and the gateway's `lint` script cannot run because
   `eslint` is not a dependency there. Don't be surprised — and don't "fix" it
   with a broad reformat that hides real changes.

> **Protocol work needs a real RustDesk host.** There is no fake host yet, so
> changes to `session.ts`, `rendezvous.ts`, `relay.ts` or `keymap.ts` can only be
> verified end to end against a machine running RustDesk on a reachable relay.
> Say in your PR what you tested against (RustDesk version, host OS, self-hosted
> or public relay). If you cannot test it, say that too — an honest "untested"
> is better than a claim that turns out false.

---

## What a good pull request looks like

- **One change per PR.** A feature and its documentation is one change; a
  feature plus an unrelated refactor is two.
- **Explain the why.** The template asks for what changed, why, and how it was
  tested. Screenshots or a short screen recording for anything visual.
- **Keep commits readable.** The history uses conventional-style subjects:

  ```
  feat(R-06): fit-to-window / 1:1 native resolution toggle
  fix(keyboard): use unicode field for text input, fixing caps-lock and layout bugs
  docs: update task list, known issues, and disable keystroke logging
  ```

  `feat(scope)`, `fix(scope)`, `docs(scope)`, optionally with a roadmap id.
- **Update the docs that the change makes wrong.** `README.md` for user-facing
  behaviour, `docs/ARCHITECTURE.md` / `docs/PROTOCOL.md` for internals,
  `docs/TASKS.md` and `docs/KNOWN_ISSUES.md` for status. A fix that leaves a
  "known issue" open is not finished.

### Checklist

- [ ] `npm run build` passes in `gateway/` and in `web/` (or the PR says which
      one does not, and why).
- [ ] No secrets, `.env` files, server IPs, keys or passwords in the diff.
      The password may only be persisted through the "Remember password" opt-in
      (`web/src/utils/passwordStorage.ts`) — never store it anywhere else.
- [ ] Tests or manual verification described; protocol changes state the
      RustDesk host and relay they were tried against.
- [ ] Docs updated for anything user-visible.
- [ ] The PR links the issue it closes (`Closes #123`).

---

## AI-assisted contributions

AI-assisted work is welcome — much of this project was written that way. The
rule is simple: **you are responsible for what you submit.** That means you
understand the change, you ran the checks, and you can answer questions about it
in review. Do not paste generated code you have not read, and do not claim
testing you did not do. "Generated, not yet run" is a valid state to describe in
a draft PR; presenting it as verified is not.

---

## Reporting security issues

Do **not** open a public issue for a vulnerability. Use GitHub's private
[Report a vulnerability](https://github.com/linkzy/rustdesk-custom-web-client/security/advisories/new) flow, described in
[`SECURITY.md`](./SECURITY.md).

---

## Code of conduct

Participation is covered by [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md)
(Contributor Covenant 2.1). Be decent; that's the short version.

---

## License

By contributing you agree that your contribution is licensed under the
repository's [MIT License](./LICENSE).
