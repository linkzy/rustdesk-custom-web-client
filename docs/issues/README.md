# Issue drafts

Ready-to-paste GitHub issues generated from the roadmap in
[`../TASKS.md`](../TASKS.md). Each file is self-contained: a title line, the
labels, the milestone, and a body with context, what to do, where in the code,
acceptance criteria, and how to test it.

**These are drafts.** The maintainer publishes them; nothing here creates issues,
labels or discussions by itself.

## Milestones

| Milestone title | Theme | Issues |
|---|---|---|
| `v0.2.0 — Community-ready` | Trust, deployability, small UX | 010, 011, 012, 020, 021, 022, 023, 050, 090, 091 |
| `v0.3.0 — Everyday remote desktop` | Saved hosts, reconnect, clipboard, mobile | 030, 031, 032, 033, 034, 035 |
| `v0.4.0 — Bigger features` | File transfer, multi-monitor, i18n | 040, 041, 042 |

The theme toggle (021) is a good first issue; it is dated for v0.4.0 with the rest
of the UI work. Move it between milestones freely — it is independent of the rest.

## Labels the drafts use

Existing on the repo: `bug`, `enhancement`, `documentation`, `question`,
`good first issue`, `help wanted`, `duplicate`, `invalid`, `wontfix`.

**Recommended new `area:` labels** — create these before publishing:

| Label | Suggested colour | Used by |
|---|---|---|
| `area:gateway` | `#1d76db` | 012, 033, 034, 040, 041 |
| `area:web` | `#0e8a16` | 020, 021, 022, 023, 030, 031, 032, 034, 035, 042 |
| `area:deploy` | `#5319e7` | 010, 011, 090 |
| `area:docs` | `#0075ca` | 050, 090, 091 |

Why: the repo has type/status labels only. With three milestones and ~19 issues,
"which half of the project is this?" is the second question a reader asks, and an
`area:` prefix keeps the list short and sortable instead of adding twenty free-form
labels.

## Files

| File | Roadmap id | Labels | Milestone |
|---|---|---|---|
| `00-roadmap-discussion.md` | — (Discussion post) | — | — |
| `010-container-healthchecks.md` | R-16 | good first issue, area:deploy | v0.2.0 |
| `011-memory-limits.md` | R-19 | help wanted, area:deploy | v0.2.0 |
| `012-structured-logging.md` | R-17 | help wanted, area:gateway | v0.2.0 |
| `020-audio-controls.md` | R-23 | good first issue, area:web | v0.2.0 |
| `021-theme-toggle.md` | R-22 | good first issue, area:web | v0.4.0 |
| `022-shortcut-help-overlay.md` | R-24 | good first issue, area:web | v0.2.0 |
| `023-friendlier-errors.md` | R-26 | good first issue, area:web | v0.2.0 |
| `030-auto-reconnect.md` | R-08 | help wanted, area:web | v0.3.0 |
| `031-persist-advanced-per-host.md` | R-07c | help wanted, area:web | v0.3.0 |
| `032-saved-hosts.md` | R-07b | help wanted, area:web | v0.3.0 |
| `033-clipboard-sync.md` | R-10 | help wanted, area:gateway | v0.3.0 |
| `034-keyboard-shortcuts.md` | KI-006 | bug, help wanted, area:web | v0.3.0 |
| `035-mobile-keyboard.md` | R-13b | help wanted, area:web | v0.3.0 |
| `040-file-transfer.md` | R-14 | help wanted, area:gateway | v0.4.0 |
| `041-multi-monitor.md` | R-12 | help wanted, area:gateway | v0.4.0 |
| `042-internationalisation.md` | R-21 | help wanted, area:web | v0.4.0 |
| `060-add-a-language.md` | R-27 | good first issue, area:web, area:docs | v0.4.0 |
| `050-docs-screenshots.md` | — | good first issue, area:docs | v0.2.0 |
| `090-scanner-noise.md` | R-18 | help wanted, area:deploy, documentation | v0.2.0 |
| `091-reverse-proxy-examples.md` | R-25 | good first issue, area:docs, documentation | v0.2.0 |

## Publishing order (dependencies)

1. **Milestones** — create all three first; issues reference them by name.
2. **`area:` labels** — create the four above.
3. **`00-roadmap-discussion.md`** — post and pin the Discussion. Every issue links
   back to it, so it has to exist.
4. **v0.2.0 deploy pair** — `010`, `011` (no coupling, immediately claimable).
5. **v0.2.0 docs pair** — `090`, `091` (both create `docs/deployment/`; landing
   them one after the other avoids a merge conflict over the folder).
6. **v0.2.0 web smalls** — `020`, `022`, `023` (all touch the toolbar area; publish
   together, they are independent but adjacent).
7. **v0.2.0 gateway** — `012` (touches every gateway file; do it before `033`).
8. **v0.3.0 chain** — `030`, then `031`, then `032` (031 blocks 032), then `033`
   and `034` (034 references 033 for copy/paste), then `035`.
9. **v0.4.0** — `040`, `041`, `021`, `042` (independent; order is cosmetic).
10. **`050-docs-screenshots.md`** last — it needs a real session and a UI that has
    stopped moving.

## Creating milestones (API)

```http
POST /repos/linkzy/rustdesk-custom-web-client/milestones
{ "title": "v0.2.0 — Community-ready", "description": "Phase 1 leftovers: deploy safety, logging, docs, small UX." }
```

Repeat for `v0.3.0 — Everyday remote desktop` and `v0.4.0 — Bigger features` before
creating any issue that names them.
