# CWS submission, OAuth and release

Everything about the Chrome Web Store (CWS) listing, the manifest, Google OAuth, and how to cut a release. Moved out of the root `CLAUDE.md` on 2026-10-11.

## Manifest permissions

```json
"permissions": ["identity", "storage", "tabs", "sidePanel", "activeTab", "scripting"],
"host_permissions": ["<all_urls>"],
"oauth2": {
  "client_id": "1088798291609-e95e1put9gp75s25o8c25l65kr9defv8.apps.googleusercontent.com",
  "scopes": ["openid", "email", "profile"]
}
```

- `identity` enables `chrome.identity` (Google OAuth2). The `oauth2` block binds the extension to a Google Cloud Console OAuth client.
- `<all_urls>` host permission is needed for `chrome.scripting.executeScript` page reads on any tab. There is no `optional_host_permissions` entry.
- Every permission needs a per-permission justification on the CWS **Privacy practices** tab (text kept in `store-listing.md`, gitignored). Declaring an unused permission gets the item rejected.

**Extension IDs**
- Local unpacked (main checkout `dist/`): `gdjoeliamfdblfefkcjcbipfcdoddebc`. Other worktrees get their own path-derived IDs.
- CWS published: `eeheooklokdjhdcnladhomkhmklcnokd`.
- The OAuth Chrome App client's **Application ID** is set to the CWS ID, so sign-in works only in the store build.

## Google Cloud Console setup (completed — branding published April 2026)

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → Create project `agentgrow`
2. APIs & Services → OAuth consent screen → External → fill App name, support email, scopes: `openid email profile`
3. APIs & Services → Credentials → Create credentials → OAuth client ID → Application type: **Chrome App**
4. Application ID: `eeheooklokdjhdcnladhomkhmklcnokd` (CWS published ID — updated for v0.1.1 resubmission)
5. Copy the `client_id` → paste into `manifest.json` `oauth2.client_id`
6. The Application ID must match the CWS-assigned extension ID, not the local unpacked ID. Sign-in in local unpacked installs requires a separate dev OAuth client or a `"key"` field in manifest pinning the unpacked install to the CWS public key.

## CWS review history

**v0.1.0 — rejected 2026-04-20** (two violations):

1. *Content Policies — "Unable to login"* (reference: Red Potassium). Root cause: Google Cloud Console OAuth Chrome App client's Application ID was still set to the local unpacked ID `gdjoeliamfdblfefkcjcbipfcdoddebc`. When the reviewer installed the CWS-signed package, its install ID was `eeheooklokdjhdcnladhomkhmklcnokd` — `chrome.identity.getAuthToken` rejected with `bad client id` because the two did not match. OAuth consent screen was already published ("In production"), so Testing-mode whitelisting was ruled out.
2. *Use of Permissions — unused* (reference: Purple Potassium): `tabGroups`, `alarms`, `contextMenus`, `notifications` were declared but not referenced anywhere in the source tree.

**v0.1.1 — fixes (resubmitted 2026-04-21):**

- Updated OAuth Chrome App client Application ID in Google Cloud Console → `eeheooklokdjhdcnladhomkhmklcnokd`. `client_id` in `manifest.json` unchanged.
- Removed the four unused permissions from `manifest.json`. Remaining 6 permissions (`identity`, `storage`, `tabs`, `sidePanel`, `activeTab`, `scripting`) all actively used.
- Re-declared per-permission justifications + single-purpose + host-permissions + remote-code fields on the CWS **Privacy practices** tab (the modern dashboard has no single "reviewer notes" text box — each permission gets its own justification field). Full text lives in `store-listing.md`.

**Known side effect of the OAuth Application ID fix:** Local unpacked sign-in now fails with `bad client id` because the dev install's ID (`gdjoeliamfdblfefkcjcbipfcdoddebc`) no longer matches the OAuth Application ID. This is *expected* and proves the production binding is correct. Two ways to restore local sign-in during dev:

- **Dev OAuth client** (fast): create a second Chrome App OAuth client in Google Cloud Console with Application ID = `gdjoeliamfdblfefkcjcbipfcdoddebc`, copy its `client_id`, temporarily swap it into `manifest.json` for local builds. Never commit the dev `client_id`.
- **`"key"` pinning** (thorough): add the CWS public key to `manifest.json` as a `"key"` field so the local unpacked install takes ID `eeheooklokdjhdcnladhomkhmklcnokd` too. Requires reading the public key from the CWS-signed CRX — feasible only after the item is live.

---


## Release process

1. Bump `version` in `app/manifest.json` **and** `app/package.json` (must match).
2. Update `CHANGELOG.md` (not created yet — create it with the first release that uses this process).
3. `pnpm typecheck && pnpm lint && pnpm test && pnpm audit` (from `app/`). `test:coverage` and `test:e2e` are not wired up yet.
4. `pnpm build:zip` → `agentgrow-v<ver>.zip` + `SHA256SUMS.txt` at the repo root; record the SHA-256 below.
5. Tag `v<ver>` and create the GitHub Release with the zip + `SHA256SUMS.txt` attached (manual — there is no CI).
6. Upload the zip on the CWS Developer Dashboard; update Privacy practices if data handling or permissions changed.
7. Update the version badge on https://devops.gheware.com/agentgrow/ and the Status section of the root `CLAUDE.md`.

**Semver:** PATCH = bug fixes; MINOR = features; MAJOR = manifest permission changes (trigger CWS re-review) or breaking storage-format changes.

## Store assets

All assets for Chrome Web Store submission are prepared and included in the repo:

| Asset | Location |
|-------|----------|
| Store listing copy + privacy disclosures | `store-listing.md` |
| Store icon (128x128) | `store-assets/store-icon-128.png` |
| Screenshots (5) | `store-assets/screenshot-{1..5}.png` |
| Promo tiles (440x280, 920x680, 1400x560) | `store-assets/promo-tile-*.png` |
| Marquee promo (1400x560) | `store-assets/marquee-promo-1400x560.png` |
| Submission zip (current) | `agentgrow-v0.1.1.zip` (SHA-256: `1c0bdbb26cdcb1bd67374deb9ea843bb29db925156de2d747d0980576165ec93`) |
| Submission zip (superseded) | `agentgrow-v0.1.0.zip` (kept on disk as historical record) |
| Zip hash (current zip only) | `SHA256SUMS.txt` |
| Zip build script | `app/scripts/zip.mjs` |

---


All of these are gitignored except `app/scripts/zip.mjs`; they exist only in the main checkout (`.worktreeinclude` copies `store-listing.md` into worktrees).

## CWS compliance rules

- Single purpose — no unrelated features.
- Privacy policy at https://devops.gheware.com/agentgrow/ must stay live and match the code.
- Data-handling disclosures (listing + Privacy practices tab) must match the code exactly. No telemetry — zero data to AgentGrow servers.
- 2FA on the CWS publisher account.

## References

- MV3 docs: https://developer.chrome.com/docs/extensions · Security: https://developer.chrome.com/docs/extensions/mv3/security
- CWS program policies: https://developer.chrome.com/docs/webstore/program-policies
- OWASP browser-extension cheat sheet: https://cheatsheetseries.owasp.org/cheatsheets/Browser_Extension_Vulnerabilities_Cheat_Sheet.html
- crxjs: https://crxjs.dev/vite-plugin · Playwright extensions: https://playwright.dev/docs/chrome-extensions
