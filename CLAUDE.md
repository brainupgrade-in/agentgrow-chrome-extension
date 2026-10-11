# CLAUDE.md — AgentGrow Chrome Extension

Open-source MV3 Chrome extension: an AI browser assistant that **automates browser tasks** (fill forms, draft emails, summarise/extract, click and navigate) through **live DOM read/write** on the active tab. Works with **any LLM provider** via a user-supplied URL + key (OpenRouter, OpenAI, Anthropic, Groq, Gemini, Ollama, any OpenAI-compatible endpoint, on-prem/private IPs). No telemetry, no AgentGrow servers.

- Homepage / privacy policy: https://devops.gheware.com/agentgrow/ · GitHub (public): https://github.com/brainupgrade-in/agentgrow-chrome-extension
- Business / monetization docs are **not** in this repo — they live in the private repo `brainupgrade-in/agentgrow-chrome-extension-business`.

---

## Status / resume point

Update this section at the end of any session that changes state.

- **Version:** v0.1.2 — built 2026-10-11 (zip SHA-256 `0848351b…`), GitHub Release cut; **CWS upload by the user pending** (also update the Privacy practices tab — disclosures now name the Gheware AI preset). v0.1.1 (CWS resubmission of 2026-04-21, review status unconfirmed) has its GitHub Release at tag `v0.1.1` = `c063fd8`, using the exact submitted zip.
- **Gates (2026-10-11):** `typecheck` ✅ · `lint` ✅ (1 known warning: hook deps in `ChatView.tsx`) · `test` ✅ (2 files: `url.test.ts`, `errors.test.ts`) · `audit --prod` ✅ (full `audit` has highs/criticals in dev tooling only — vite, vitest, eslint, crxjs) · `build` ✅ · `test:e2e` ❌ (no Playwright config or tests) · no CI.
- **Docs vs code:** much of the design doc and the old CLAUDE.md described *target* architecture. What is actually implemented is listed in `app/CLAUDE.md` § "Implemented vs target" — trust that, not the design doc.
- **Next up:** upload v0.1.2 to CWS · revise the monetization spec (private repo) after its review · options page (T1/T5/T6 trust features are unbuilt) · Playwright e2e.

---

## Where things are documented — read only what the task needs

| File | Read when |
|---|---|
| `app/CLAUDE.md` | Changing any code under `app/` — layout, conventions, implemented-vs-target, stability rules, LLM streaming |
| `docs/cws-and-release.md` | Manifest/permissions, OAuth & extension IDs, CWS submission/review history, release steps, store assets |
| `docs/roadmap.md` | Feature status, trust features T1–T10, phases |
| `agentgrow.io-chrome-extension-design.md` | **Gitignored, 2.6k lines, describes target design not current code.** Don't read it whole: `grep -n '^## ' agentgrow.io-chrome-extension-design.md` then `Read` with `offset`/`limit` |
| `store-listing.md` | **Gitignored.** CWS listing copy + per-permission justifications. Must match code behaviour exactly |
| `abacusai-chrome-ext.md`, `chrome-extensions-dev-best-practices.md` | Gitignored reference studies — only when asked |

Gitignored docs exist only in the main checkout; `.worktreeinclude` / `app/scripts/setup-worktree.sh` copy them into worktrees.

**Harness (`.claude/`, committed):** `settings.json` allows the gates and read-only git, asks before `git push`, `pnpm build:zip` and edits to `app/manifest.json`, and runs a typecheck hook after every edit under `app/src` (`hooks/typecheck-on-edit.sh` — fix what it reports before moving on). Project skills: `cws-release`, `add-dom-action`, `add-provider-preset`. Personal overrides go in the gitignored `.claude/settings.local.json`.

---

## Architecture

```
Side Panel (React)  ←──sendMessage──→  Service Worker  ←─executeScript──→  Page DOM (reads)
Side Panel (React)  ←═══ Port ════════ Service Worker  ←──sendMessage──→  Content Script (writes + toast)
                                             ↕
                                      User LLM endpoint
```

- `src/background/index.ts` (~1.3k lines) — message router, auth gate, LLM streaming, DOM reads (`readPageDirect`, `readSelectionDirect`), DOM write relay, private-network fallback.
- `src/content/index.ts` — DOM writes (fill, click, highlight, insert) + shadow-DOM activity toast with Stop.
- `src/sidepanel/` — React UI (the only UI; there is no popup). `src/options/` is a stub.
- LLM calls happen **only in the service worker**. One-shot ops use `sendMessage`; token streaming uses the named Port `llm-stream`.
- **Everything is gated behind Google sign-in** (`chrome.identity`).

---

## Commands (run from `app/`)

```bash
pnpm install            # deps (pnpm only — never npm)
pnpm dev                # vite watch → ../dist ; VITE_PORT=5174 pnpm dev for a 2nd worktree
pnpm build              # production build → ../dist (repo root)
pnpm build:zip          # build + agentgrow-v<ver>.zip + SHA256SUMS.txt (release only)
pnpm typecheck          # tsc --noEmit
pnpm lint               # ESLint 9 flat config (eslint.config.js)
pnpm test               # vitest
pnpm audit              # before every release
```

Load in Chrome: `chrome://extensions` → Developer mode → Load unpacked → repo-root `dist/`.
Debug: side panel → right-click → Inspect · service worker → "Service Worker" link on `chrome://extensions`.

**Unpacked builds cannot sign in** (`bad client id`) — the OAuth client is bound to the CWS extension ID. This is expected; don't "fix" it. See `docs/cws-and-release.md`.

---

## Parallel development

- Use git worktrees; each has its own `dist/` and `node_modules`. After creating one, run `bash app/scripts/setup-worktree.sh`.
- Give each concurrent `pnpm dev` its own `VITE_PORT`. Running `pnpm dev` in a checkout overwrites that checkout's `dist/` with a dev build — rebuild with `pnpm build` before loading it as a real extension.
- Each worktree's `dist/` loads as a separate unpacked extension with its own ID.
- Only release from `main` in the main checkout. Never edit `app/manifest.json` permissions, `oauth2.client_id` or `version` outside a deliberate release — permission changes trigger CWS re-review.

---

## Security rules (hard rules, every change)

Threat model: design doc §9.

**Permissions**
1. Current permissions: `identity, storage, tabs, sidePanel, activeTab, scripting` + host `<all_urls>` (needed for `executeScript` page reads). Adding any permission needs a justification in `store-listing.md` and triggers CWS re-review. Unused permissions caused the v0.1.0 rejection.
2. No `externally_connectable`, no `runtime.onMessageExternal`; `web_accessible_resources` stays `[]`.

**Keys & storage**
3. API keys encrypted at rest (AES-GCM-256, `background/KeyVault.ts`); never plaintext in `chrome.storage`; never in `sync` storage.
4. Keys and the Google OAuth token never leave the service worker — UI gets only `{ email, name, picture, isAuthenticated }`.
5. Auth session lives in `chrome.storage.session` only. Sign-out revokes the token (Google `oauth2/revoke` endpoint + `removeCachedAuthToken`) and clears the session.

**Network**
6. HTTPS for remote providers; `http://` only for localhost / private IPs — `core/utils/url.ts` (`isAllowedProviderUrl`, covered by `url.test.ts`). Rule: re-validate at call time, not just on save.

**Messages**
7. Every privileged handler calls `ensureAuthenticated()`; unauthenticated callers get `{ success: false, error: 'UNAUTHENTICATED' }`.
8. Validate payloads with Zod (`core/types/messages.ts`). Treat content-script messages as untrusted; check `sender.tab`. Never send sensitive data to content scripts.
9. DOM write types go through the service worker after the auth gate — new ones must be added to `DOM_WRITE_TYPES` in `background/index.ts`.

**DOM / XSS**
10. No `innerHTML` / `outerHTML` / `document.write` / `dangerouslySetInnerHTML`. **One documented exception:** the static toast template in `content/index.ts` set inside a closed shadow root. Don't add others.
11. Markdown renders through react-markdown + `rehype-sanitize`.
12. Page content sent to the LLM is wrapped in `=== PAGE CONTEXT ===` delimiters and capped (`MAX_TEXT` = 30k chars in `readPageDirect`).
13. Form fills: native value setter + `InputEvent` + focus/input/change/blur (React/Angular/Vue-safe) — never `setAttribute('value')`. Wrap `querySelector` with try/catch. Highlights use `<mark class="agentgrow-highlight">` and clear with `parent.normalize()`.

**Action safety**
14. "Ask before acting" is the default (approve/cancel per DOM write). "Auto-act" shows a persistent warning banner.
15. The activity toast is a closed shadow root driven only by `DOM_ACTIVITY_SHOW/HIDE` from the service worker; Stop sends `CHAT_STOP`, which aborts all streams and clears toasts in all tabs. Always hide the toast in `finally` and on port disconnect.

**Store compliance**
16. Single purpose; no telemetry; data disclosures in `store-listing.md` must match the code exactly; no remote/CDN scripts (CSP `script-src 'self'; object-src 'none'; base-uri 'none'`).

**Pre-change checklist:** no new permissions without justification · no new `innerHTML`-family use · keys/tokens stay in the SW · new handlers have `ensureAuthenticated()` + Zod · new DOM write types in `DOM_WRITE_TYPES` + wrapped with `setActivity()` and cleaned up in `finally` · `pnpm typecheck && pnpm lint && pnpm test` pass.

Known gaps (specified, **not implemented**): incognito detection (`chrome.extension.inIncognitoContext` + "Sign-in not available in Incognito"); provider-URL re-validation at call time (today `isAllowedProviderUrl` runs only in `ProviderFormView.tsx` on save).
