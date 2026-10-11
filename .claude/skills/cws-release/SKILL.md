---
name: cws-release
description: Cut an AgentGrow release — version bump, gates, CWS zip + SHA-256, git tag, GitHub Release, Chrome Web Store upload checklist. Use when the user asks to release, ship, publish, bump the version, build the store zip, or prepare a CWS submission.
---

# Release AgentGrow to GitHub + Chrome Web Store

Background (OAuth binding, extension IDs, the v0.1.0 rejection): `docs/cws-and-release.md`. Read its "CWS review history" before touching permissions or OAuth.

Work from the **main checkout on `main`** (the gitignored zip, `SHA256SUMS.txt`, `store-listing.md` and store assets live only there). Confirm with the user before steps 6–8 — they publish.

1. **Preflight** — `git status` clean, on `main`, up to date with origin. Ask which version (semver: PATCH fixes, MINOR features, MAJOR = permission change or breaking storage format).
2. **Permissions check** — diff `app/manifest.json` against the last tag: `git diff v<prev> -- app/manifest.json`. Any added permission or host permission needs (a) real use in `app/src`, (b) a justification in `store-listing.md`, (c) the user told it triggers a CWS re-review. Never declare an unused permission — that caused the v0.1.0 rejection. Never change `oauth2.client_id`.
3. **Bump** `version` in BOTH `app/manifest.json` and `app/package.json` (must match). Add a `CHANGELOG.md` entry (create the file if missing).
4. **Gates** (from `app/`): `pnpm typecheck && pnpm lint && pnpm test && pnpm audit`. Stop on any error or high/critical audit finding.
5. **Zip** — `pnpm build:zip` → `agentgrow-v<ver>.zip` + `SHA256SUMS.txt` at the repo root. Verify: `unzip -l agentgrow-v<ver>.zip | grep manifest.json` and `jq .version dist/manifest.json` equals the new version; no `.map` files inside.
6. **Commit + tag** — commit the bump/changelog, `git tag v<ver>`, push branch and tag (ask first).
7. **GitHub Release** — `gh release create v<ver> agentgrow-v<ver>.zip SHA256SUMS.txt --title "v<ver>" --notes-file <changelog excerpt>`.
8. **CWS** — the user uploads the zip on the Developer Dashboard. Remind them to update the Privacy practices tab if permissions or data handling changed (text in `store-listing.md`).
9. **Record** — update the "Status / resume point" in root `CLAUDE.md`, the submission-zip row + SHA-256 in `docs/cws-and-release.md`, and `docs/roadmap.md`. Remind the user to bump the version badge on https://devops.gheware.com/agentgrow/.

Expected quirk: the unpacked `dist/` build cannot sign in (`bad client id`) — only the store-installed build can. That is not a release blocker.
