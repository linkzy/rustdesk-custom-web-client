## What changed and why

<!-- What does this PR do, and what problem does it solve? Link the issue: "Closes #123". -->

## How it was tested

<!--
Be specific and honest. Examples:
- `npm run build` in gateway/ and web/ (both pass)
- Opened the UI, connected to <RustDesk version> on <host OS> through my self-hosted relay and typed in a terminal
- Not tested against a real host (no reachable relay) — please say what the reviewer should try
-->

- [ ] `npm run build` passes in `gateway/`
- [ ] `npm run build` passes in `web/`
- [ ] Tested against a real RustDesk host (say which version/OS/relay below, or explain what could not be tested)

## Screenshots / recording

<!-- For anything visual. Before/after is ideal. Redact machine IDs, passwords and addresses. -->

## Checklist

- [ ] One logical change; no unrelated reformatting
- [ ] Docs updated for anything user-visible (`README.md`, `docs/ARCHITECTURE.md`, `docs/PROTOCOL.md`, `docs/TASKS.md`, `docs/KNOWN_ISSUES.md` as applicable)
- [ ] No secrets, `.env` files, server addresses or keys in the diff
- [ ] No password stored anywhere except behind the "Remember password" opt-in (`web/src/utils/passwordStorage.ts`)
- [ ] `docs/KNOWN_ISSUES.md` status matches the change (a fixed issue is not left "Open")

## Notes for the reviewer

<!-- Anything you are unsure about, alternatives you rejected, follow-ups you deliberately left out. -->
