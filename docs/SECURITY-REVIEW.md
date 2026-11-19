# Security review checklist for fork PRs

**This is the reviewer's checklist, not a guarantee.** Working through it does not
prove a change is safe; skipping an item does not prove it is unsafe. It exists so
that every contribution from a fork gets the same questions asked, and so a reviewer
can say plainly what was and was not looked at.

`rclient` is a browser client for a remote desktop: it carries video and audio,
forwards keyboard and mouse input, and handles the RustDesk password. A change to
this codebase can leak a session or a credential without ever looking like a
security change. Review the diff before running anything from the fork.

## 1. Read the diff before executing anything

- [ ] Read the whole diff, not just the summary, **before** installing or running
      the fork's code. `git fetch origin refs/pull/<n>/head`, then
      `git diff <our-main>..FETCH_HEAD`.
- [ ] Check the dependency surface first: `package.json`, `package-lock.json` in
      both packages. Any **added** package, or a version **upgrade**, is a
      supply-chain question — especially `postinstall` / `prepare` scripts. If the
      PR adds a package, report it before running `npm install`/`npm ci`.
- [ ] Tell apart the contributor's commits from the branch's base. A fork that
      branched before our latest `main` will show unrelated lockfile churn and
      deletions (including `docs/rules.json`) that are simply missing merges, not
      hostile edits. Diff against the merge-base: `git diff $(git merge-base main FETCH_HEAD)..FETCH_HEAD`.
- [ ] Is the change in scope for what it claims? A "theme toggle" that touches
      `gateway/`, `.github/workflows/`, `Dockerfile`, `nginx.conf`, `index.html` or
      the compose files needs an explicit reason.

## 2. Session data and the WebSocket bridge

- [ ] No new outbound traffic: `fetch`, `XMLHttpRequest`, `WebSocket`,
      `postMessage`, `navigator.sendBeacon`, `<img>`/`<link>` beacons, or new
      `@import` / `url()` pointing off-origin. The page should talk to its own
      gateway (`/config`, `/ws`) and nothing else; hCaptcha is the one known
      third party.
- [ ] The WebSocket URL, the `connect` payload and the `mouse`/`key` messages are
      unchanged unless the PR is about them.
- [ ] Nothing new is logged: no `console.*` of the target ID, the password, the
      server key, frame data or the handshake. Debug-panel logs are visible to
      anyone looking at the screen and to screen-sharing.
- [ ] No new `localStorage`/`sessionStorage` key holds session data. Compare the
      key set before and after (`rclient_*`): a new key must be justified and must
      not carry the password or the target ID beyond what exists today.

## 3. Password handling (PROJ-002)

- [ ] The password is written to `localStorage` **only** behind the "Remember
      password" opt-in, and **only** after a successful connection
      (`web/src/utils/passwordStorage.ts`). Read the diff for any new path that
      stores it earlier, stores it on failure, or stores it when the box is
      unticked.
- [ ] Nothing transmits the password anywhere except the existing `connect`
      message to our own gateway.
- [ ] Un-ticking the box still deletes the stored password; clearing or failing a
      connection still discards the pending attempt.
- [ ] No password, key or ID appears in logs, error strings, DOM attributes or
      test fixtures.

## 4. Injection and DOM sinks

- [ ] No `innerHTML`, `dangerouslySetInnerHTML`, `document.write`, `eval`,
      `new Function`, `setTimeout("…")` with a string, or `javascript:` URL.
- [ ] Any value that reaches the DOM or a URL (relay host, server key, ID, error
      message from the gateway) is rendered as text through React, not as HTML.
- [ ] Error messages from the gateway are still rendered as text — a server-sent
      string must never be interpreted as markup.
- [ ] No obfuscated code: encoded strings (`atob`, `\x..`, base64 blobs),
      dynamic `import()` of something that is not a local module, or unexplained
      indirection.

## 5. Weakening the existing posture

- [ ] No HTML escaping removed, no loosened CSP-relevant behaviour, no new inline
      script/style that a strict CSP would have to allow.
- [ ] No check disabled or softened to look green (PROJ-007): no skipped tests,
      no `|| true`, no widened `eslint-disable`, no `tsconfig` that stops checking
      a file, no lowered coverage or timeout.
- [ ] Existing tests are not deleted or gutted. New tests should assert
      behaviour a user can see (what is applied to the DOM, what is stored), not
      just that a helper was called.
- [ ] Error handling still surfaces a failed authentication; nothing swallows an
      auth error into a generic state.

## 6. Prototype pollution and unsafe merging

- [ ] Any new util that merges objects (`{...a, ...b}`, `Object.assign`, deep
      merge) does not take keys from untrusted input, and never assigns
      `__proto__`, `constructor` or `prototype`.
- [ ] Data read back from `localStorage` is treated as untrusted: validated
      against a whitelist before use, not trusted because it was written by us
      earlier.

## 7. Rules register and docs (PROJ-001)

- [ ] `docs/rules.json` is not edited by hand and no rule is silently dropped.
      Rules change through Symbio's register tools, not in a PR.
- [ ] Docs and comments do not overstate what the code does — no returning to a
      "passwords are never stored" style claim, no "secure" claim that the code
      does not back.
- [ ] No `.env` file, server address, key or credential is committed.

## 8. Verify it actually works

Run these in a **detached worktree** of the PR head, never by merging into main,
and report the exit code of each:

```bash
git fetch origin refs/pull/<n>/head
git worktree add --detach /tmp/pr-<n> FETCH_HEAD
cd web && npm ci && npm run lint && npm run typecheck && npm test && npm run build
```

- [ ] All four pass: lint, typecheck, test, build. Say so with exit codes.
- [ ] When our `main` has moved (new dependency bumps, new rules), merge the PR
      into a second throwaway worktree and run the four checks against **that**
      tree — the state that would actually ship.
- [ ] Read the new tests: do they assert behaviour? Does a parameterised test
      actually cover the pairs it says it covers?

## 9. Report

State the verdict plainly — *safe to merge*, *safe with these changes*, or *do not
merge because X* — with `file:line` for every finding. Then say what was verified
and what was not. A review that does not say what was checked is worthless; if you
found nothing, write "no security-relevant changes found" and list the surfaces you
looked at.
