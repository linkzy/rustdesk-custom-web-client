# Releasing rclient

A release is: three manifests on one version, a changelog entry, a tag on `main`,
images published for that tag, and a GitHub Release whose notes people can read.
This page is the order to do it in. The current version is in
[`../CHANGELOG.md`](../CHANGELOG.md).

Versions are rclient's own. The `LoginRequest.version` string in
`gateway/src/session.ts` (`1.3.8`) is the **RustDesk protocol** version the
gateway speaks — never change it as part of a release.

---

## 1. Decide the version

The project follows [Semantic Versioning](https://semver.org/). While the major
version is `0`, a new feature milestone bumps the **minor** (`0.2.0`), a bug-fix
release bumps the **patch** (`0.2.1`).

Check nothing is left open for the milestone: `docs/TASKS.md` and
`docs/KNOWN_ISSUES.md` must agree with each other and with the code.

## 2. Bump the three manifests

The root, gateway and web manifests carry the same version:

```bash
node -e "for (const p of ['package.json','gateway/package.json','web/package.json']) { const fs=require('fs'); const j=JSON.parse(fs.readFileSync(p,'utf8')); j.version='0.2.0'; fs.writeFileSync(p, JSON.stringify(j,null,2)+'\n'); }"
```

Then refresh the lockfiles so they match, without touching installed packages:

```bash
cd gateway && npm install --package-lock-only
cd ../web && npm install --package-lock-only
```

`web` is `private` and its version is not used by the build; it is bumped so a
single version answers "what am I running" in all three packages.

## 3. Write the changelog entry

In [`../CHANGELOG.md`](../CHANGELOG.md), move the entries from `[Unreleased]`
into a new `## [0.2.0] — YYYY-MM-DD` section (Keep a Changelog headings:
Added / Changed / Deprecated / Removed / Fixed / Security), and update the
compare links at the bottom of the file.

Write for someone deciding whether to upgrade, and keep it honest: a limitation
or behavioural change belongs in the entry even when it is inconvenient (for
example the remember-password change in 0.2.0).

## 4. Prove it before tagging

From a clean checkout, all of these must exit 0:

```bash
cd gateway && npm ci && npm run lint && npm run typecheck && npm test && npm run build
cd ../web  && npm ci && npm run lint && npm run typecheck && npm test && npm run build
```

CI runs the same five steps on the pull request that carries the bump. Do not tag
a commit whose checks are red — that is what the checks are for.

## 5. Merge, then tag `main`

The bump lands through the normal pull request. After it is merged and CI on
`main` is green:

```bash
git checkout main
git pull
git tag -a v0.2.0 -m "rclient 0.2.0 — Community-ready"
git push origin v0.2.0
```

Annotated tags carry the tagger and date; the release notes live in the GitHub
Release, not in the tag message.

## 6. What the tag publishes

`push: tags: ['v*']` on `.github/workflows/docker-build.yml` builds both images
for `linux/amd64` and `linux/arm64` and pushes, per image:

| Trigger | Tags on `ghcr.io/linkzy/rclient-gateway` (and `-web`) |
|---|---|
| Push to `main` | `latest`, `sha-<short>` |
| Tag `v0.2.0` | `0.2.0`, `0.2`, `sha-<short>`, `latest` |

So a self-hoster who wants to stay put pins the version:

```yaml
# docker-compose.prod.yml
image: ghcr.io/linkzy/rclient-gateway:0.2.0
image: ghcr.io/linkzy/rclient-web:0.2.0
```

The tag push runs the same build twice (main push, then tag push) — harmless, and
it means a tag that fails to build is visible as a red run on the tag itself.

`workflow_dispatch` on the same workflow builds from whatever branch you pick and
pushes only `latest` and the sha tag; use it for a re-build, not for a release.

## 7. Publish the GitHub Release

Create the release from the tag (GitHub → Releases → *Draft a new release* →
choose `v0.2.0`), paste the notes, and mark it the latest release. The notes are
the changelog entry reorganised for a reader: what this is, why upgrade, what
changed, known limitations, and how to get it.

Once a GitHub Release exists, the README's release badge works:

```markdown
[![release](https://img.shields.io/github/v/release/linkzy/rustdesk-custom-web-client?label=release)](https://github.com/linkzy/rustdesk-custom-web-client/releases)
```

Before the first Release, `/github/v/release/...` renders "no releases found" —
use the tag badge (`.../github/v/tag/...`) until then.

## 8. After the release

- Open the next `[Unreleased]` section in the changelog.
- Move finished roadmap items in `docs/TASKS.md`, and close the milestone on
  GitHub (open issues left in it roll into the next one).
- If the demo runs the released images, redeploy it — see
  [`../deploy/DEMO.md`](../deploy/DEMO.md).

---

## Quick reference

```bash
# 1. bump
node -e "for (const p of ['package.json','gateway/package.json','web/package.json']) { const fs=require('fs'); const j=JSON.parse(fs.readFileSync(p,'utf8')); j.version='0.2.0'; fs.writeFileSync(p, JSON.stringify(j,null,2)+'\n'); }"
(cd gateway && npm install --package-lock-only)
(cd web && npm install --package-lock-only)

# 2. changelog: [Unreleased] -> [0.2.0] — YYYY-MM-DD

# 3. checks (or just wait for CI on the PR)
(cd gateway && npm ci && npm run lint && npm run typecheck && npm test && npm run build)
(cd web     && npm ci && npm run lint && npm run typecheck && npm test && npm run build)

# 4. merge the PR, then
git tag -a v0.2.0 -m "rclient 0.2.0 — Community-ready"
git push origin v0.2.0

# 5. GitHub Release from the tag, notes from CHANGELOG.md
```
