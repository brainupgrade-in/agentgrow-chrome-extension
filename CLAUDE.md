# CLAUDE.md — AgentGrow Chrome Extension

Open-source AI browser assistant that **automates common browser tasks** — filling forms, writing email drafts, creating/editing/summarizing documents, navigating complex sites — to save users time. Connects to **any LLM provider** (OpenRouter, OpenAI, Anthropic, Groq, Ollama, or any OpenAI-compatible endpoint) via user-supplied API URL + key. No subscriptions. No vendor lock-in.

**Full design (architecture, data models, streaming, reliability, test suite):** `agentgrow.io-chrome-extension-design.md`  
**Reference studies:** `abacusai-chrome-ext.md`, `chrome-extensions-dev-best-practices.md`

---

## Project Goal

Build a Chrome extension (Manifest V3) that helps users automate repetitive browser tasks via AI — comparable to AbacusAI and Claude's browser extensions, but fully open source and LLM-provider-agnostic. Key differentiator: **live DOM read/write** on the adjacent tab — no screenshots, no snapshots.

### Core Use Cases
- **Form Automation** — auto-fill job applications, registrations, checkout forms, surveys
- **Email & Message Drafting** — compose emails in Gmail/Outlook, messages in Telegram/Slack
- **Document Tasks** — summarize articles, extract data (emails, links, tables, prices), create drafts
- **Site Navigation** — find information on complex sites, answer questions about page content
- **Data Extraction** — pull structured data from any page into usable formats

### Features
1. **Side panel chat** — persistent AI chat alongside any webpage with streaming responses (SSE for OpenAI-compatible, NDJSON for Ollama)
2. **Conversation persistence** — active conversation saved to `chrome.storage.local`, restored on panel reopen
3. **Smart context** — auto-reads page content + text selection; no manual toggles needed
4. **Multi-model dropdown** — switch models in 1 click from the chat view header
5. **Chat UX** — New Chat button, copy message to clipboard, retry failed messages, timestamps on every message
6. **DOM write-back** — form fill (React-compatible) + contenteditable support (Telegram, Slack, Gmail), text highlight, cursor insert
7. **Provider management** — add/edit/delete any OpenAI-compatible endpoint or Ollama; 7 built-in presets; provider selection persisted to `chrome.storage.local`
8. **Save confirmation toast** — visual feedback after provider connection test
9. **Friendly error messages** — HTTP errors (401/429/404/5xx) parsed into human-readable explanations
10. **Error boundary** — wraps entire side panel; React crashes show recovery UI instead of blank screen
11. **Live page context** — structured DOM extraction (headings, forms, code blocks, links, selection) via `chrome.scripting.executeScript`

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Build | Vite + `@crxjs/vite-plugin` |
| Language | TypeScript 5.x (strict) |
| UI | React 18 |
| State | Zustand (slice-per-domain) |
| Styling | Tailwind CSS + CSS variables |
| Markdown | react-markdown + remark-gfm + **rehype-sanitize** |
| Icons | Lucide React |
| Validation | **Zod** (all message payloads + provider URL validation) |
| Tests (unit) | Vitest + jsdom |
| Tests (e2e) | Playwright |
| API mocking | MSW (Mock Service Worker) |
| Crypto | Web Crypto API (built-in, no deps) |
| Package manager | pnpm |

---

## Chrome Extension Architecture (MV3)

```
Side Panel (React)  ←──sendMessage──→  Service Worker  ←─executeScript──→  Page DOM (reads)
Side Panel (React)  ←═══ Port ════════ Service Worker  ←──sendMessage──→  Content Script (writes)
                                             ↕
                                      User LLM endpoint
   Options.html                  (OpenRouter / Ollama / OpenAI / on-prem)
```

- `src/background/` — Service Worker: message router, LLM calls, **ProviderManager**, **KeyVault**, DOM relay, auth
- `src/sidepanel/` — React app: chat UI, settings, provider form, **ErrorBoundary**, sign-in gate
- `src/content/` — Content script: **DOM write only** — form fill, highlight, insert (reads done via `chrome.scripting.executeScript` inline)
- `src/options/` — Options page: privacy dashboard, audit log, about
- `src/core/` — Shared: provider interfaces, **dom types**, canonical types, utilities

**Key rules:**
- LLM API calls are made **only from the service worker** — never from content scripts
- API keys never reach content scripts, popup, or UI components
- One-shot operations use `sendMessage`; streaming uses a named `Port` (`llm-stream`)
- **All features are gated behind Google authentication** — unauthenticated users see only the sign-in screen

---

## LLM Provider System

Two adapters cover all supported providers — see design doc §5 for full implementation:

- `OpenAICompatibleProvider` — covers OpenRouter, OpenAI, Anthropic, Groq, Google Gemini, LM Studio, vLLM. SSE streaming with `AbortController` + connect/idle timeouts.
- `OllamaProvider` — local Ollama (NDJSON streaming, `/api/chat`, `/api/tags`)

All providers implement `ILLMProvider` (`src/core/providers/ILLMProvider.ts`): `complete()`, `stream(requestId, request)`, `listModels()`, `testConnection()`.

**Built-in presets (7):** OpenRouter · OpenAI · Anthropic · Groq · Google Gemini · Ollama (local) · Custom

Presets defined in `src/core/types/provider.ts` (`PROVIDER_PRESETS`). Each preset includes: base URL, curated model list, key placeholder, docs URL, and `requiresKey` flag. Managed via `ProviderManager.ts` (service worker) + `providerStore.ts` (Zustand, side panel).

---

## Source Layout

```
dist/             built extension — load unpacked from here (ID: gdjoeliamfdblfefkcjcbipfcdoddebc)
app/              full extension source (Vite + crxjs, run all commands from here)
  src/
    background/
      index.ts          service worker — message router, DOM relay, auth gate
      AuthService.ts    Google OAuth2 via chrome.identity
      ProviderManager.ts provider CRUD, storage, default management
      KeyVault.ts       AES-GCM-256 encrypted API key storage
    sidepanel/
      App.tsx           screen router (chat / settings / provider-add / provider-edit)
      ErrorBoundary.tsx React error boundary wrapping entire side panel
      views/
        ChatView.tsx        chat shell + smart context (auto page/selection)
        SignInView.tsx       Google sign-in gate
        SettingsView.tsx     provider list + about links
        ProviderFormView.tsx add/edit provider with 7 presets
      hooks/
        useAuth.ts          auth state + session storage listener
        usePageContext.ts    DOM read/write hook (page context, selection, fill, highlight)
      store/
        providerStore.ts    Zustand store for provider list + active selection
      utils/
        messaging.ts        typed sendMessage() helper
    content/
      index.ts          DOM write operations only (fill, highlight, insert)
    options/
      main.tsx          settings page stub
    core/
      types/
        auth.ts         AuthSession, PublicUserInfo, AuthState
        messages.ts     MessageType enum, AgentGrowMessageSchema (Zod)
        provider.ts     ProviderConfig, PROVIDER_PRESETS (7 presets)
        dom.ts          StructuredPageContent, FormField, DomWriteResult, …
        conversation.ts Conversation, ConversationSummary
      utils/
        storage.ts      safeStorageSet (quota guard)
        url.ts          isAllowedProviderUrl, providerSecurityTier
  manifest.json   full MV3 manifest with oauth2 block
  package.json    pnpm deps
```

**Run from `app/` directory for all commands below.**

---

## Common Commands

### Development

```bash
pnpm install                  # install dependencies
pnpm dev                      # Vite watch mode (outputs to dist/)
pnpm build                    # production build
pnpm build:zip                # create CWS-ready zip
pnpm audit                    # check for vulnerable dependencies (run before every release)
```

### Load Extension in Chrome

1. `pnpm build` (or `pnpm dev` for hot-reload via crxjs)
2. `chrome://extensions` → Developer Mode → Load Unpacked → select `dist/` (repo root)
3. Pin the extension to toolbar

### Testing

```bash
pnpm test                     # run all unit tests (Vitest)
pnpm test:watch               # watch mode
pnpm test:coverage            # with coverage report
pnpm test:e2e                 # Playwright e2e (requires pnpm build first)
pnpm test:e2e --headed        # with visible browser
pnpm typecheck                # tsc --noEmit
pnpm lint                     # ESLint
pnpm lint:fix                 # ESLint --fix
```

### Debugging

- **Side panel**: Right-click panel → Inspect
- **Service worker**: `chrome://extensions` → click "Service Worker" link
- **Content script**: DevTools on page → Sources → Content Scripts
- **Errors**: Red "Errors" button on `chrome://extensions`

---

Full annotated file tree: design doc §12.

---

## Manifest Permissions

```json
"permissions": ["storage", "tabs", "tabGroups", "sidePanel", "activeTab",
                "scripting", "alarms", "contextMenus", "notifications", "identity"],
"host_permissions": ["<all_urls>"],
"optional_host_permissions": ["<all_urls>"],
"oauth2": {
  "client_id": "1088798291609-e95e1put9gp75s25o8c25l65kr9defv8.apps.googleusercontent.com",
  "scopes": ["openid", "email", "profile"]
}
```

- `identity` permission enables `chrome.identity` API (Google OAuth2 flow)
- `oauth2` block ties the extension to a Google Cloud Console OAuth2 client
- **Extension ID: `gdjoeliamfdblfefkcjcbipfcdoddebc`** (loaded unpacked from `dist/`)
- `host_permissions` includes `<all_urls>` — needed for `chrome.scripting.executeScript` inline page reads on any tab

### Google Cloud Console Setup (completed — branding published April 2026)

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → Create project `agentgrow`
2. APIs & Services → OAuth consent screen → External → fill App name, support email, scopes: `openid email profile`
3. APIs & Services → Credentials → Create credentials → OAuth client ID → Application type: **Chrome App**
4. Application ID: `gdjoeliamfdblfefkcjcbipfcdoddebc`
5. Copy the `client_id` → paste into `manifest.json` `oauth2.client_id`
6. For production CWS publish: update the ID to the published extension's ID and recreate credentials

---

## Security Rules

Hard rules enforced in every PR. See design doc §9 for threat model and full CSP.

### A. Permissions (Least Privilege)
1. `host_permissions` is `["<all_urls>"]` — required for `chrome.scripting.executeScript` page reads on any tab. This was moved from `optional_host_permissions` because inline script injection for DOM extraction needs broad host access.
2. Use `activeTab` over host permissions wherever possible.
3. Do NOT add `externally_connectable` without a documented need.
4. `web_accessible_resources` stays `[]` unless restricted to specific trusted origins.
5. Do NOT register `runtime.onMessageExternal`.

### B. API Keys & Storage
6. API keys encrypted at rest (AES-GCM-256, `KeyVault.ts`). Never plaintext in `chrome.storage`.
7. Keys never leave the service worker — no raw key values in content scripts, popup, or options.
8. No sensitive data in `chrome.storage.sync` — sync goes to Google servers.

### C. Network
9. HTTPS required for all remote provider URLs. `http://` allowed only for localhost or private IP ranges.
10. Re-validate URL at call time, not just at save time.

### D. Message Passing & Input Validation
11. Treat all content script messages as untrusted. Validate `sender.tab` before acting on privileged operations.
12. Validate all message payloads with Zod schemas before use.
13. Never send sensitive data back to content scripts.

### E. DOM & XSS Prevention
14. Never use `innerHTML`, `outerHTML`, or `document.write()` anywhere.
15. Never use `dangerouslySetInnerHTML`. Use `rehype-sanitize` in the react-markdown pipeline.
16. Wrap all untrusted page content with `=== PAGE CONTEXT ===` delimiters. Truncate to `MAX_CONTEXT_CHARS`.

### F. Content Script Safety
17. Content script handles **write operations only** (form fill, highlight, insert). DOM reads are performed via `chrome.scripting.executeScript` inline functions from the service worker — no content script involvement for reads.
18. Sanitize DOM text before sending to the service worker. Strip `<script>`, `<style>`, event attributes.

### K. DOM Write Safety
34. Only write to `<input>`, `<textarea>`, `<select>` elements — never to arbitrary DOM nodes.
35. Validate CSS selectors with a try/catch before querying (`document.querySelector` throws on bad selectors).
36. Use the native value setter + dispatching `input`/`change` events for React-compatible form fills — never `el.setAttribute('value', …)`.
37. `DOM_FILL_FORM` instructions originate from the service worker (after auth gate) — never directly from the page.
38. Text highlighted via `<mark class="agentgrow-highlight">` must be clearable; never remove marks without `parent.normalize()` to avoid orphan text nodes.
39. `insertTextAtCursor` uses `document.execCommand('insertText')` only for contenteditable — deprecated but still the only safe cross-framework method; guard with `isContentEditable` check.

### G. Content Security Policy
19. CSP: `"script-src 'self'; object-src 'none'; base-uri 'none';"` — no eval, no inline, no CDN, no base-tag injection.

### H. Dependency Security
20. Run `pnpm audit` in CI on every push. Block merges on high/critical vulnerabilities.
21. No CDN-loaded scripts. All dependencies bundled at build time.
22. Minimise dependencies — prefer built-in Web APIs.

### J. Authentication

28. **All features gated behind Google auth.** The service worker checks auth state before processing any message. Unauthenticated callers receive `{ success: false, error: 'UNAUTHENTICATED' }`.
29. **Auth token lives in `chrome.storage.session` only** — cleared when the browser closes. Never in `local` or `sync` storage.
30. **`chrome.identity.getAuthToken({ interactive: false })` on every service worker wake** — verify token is still valid before handling any request. If expired or absent, set auth state to signed-out.
31. **Token never leaves the service worker** — UI components receive only `{ email, name, picture, isAuthenticated: true }`. Raw Google OAuth token is never sent to the side panel, popup, or content scripts.
32. **Sign-out revokes the token** via `chrome.identity.removeCachedAuthToken` + `chrome.identity.revokeToken`. Clears all user-specific data from `chrome.storage.session`.
33. **Incognito mode**: `chrome.identity` does not work in incognito. Detect via `chrome.extension.inIncognitoContext` and show an explicit `"Sign-in not available in Incognito"` message.

### I. Chrome Web Store Compliance
23. Single purpose — no unrelated features.
24. Privacy policy at `https://devops.gheware.com/agentgrow/` before CWS submission.
25. Data handling disclosures must match the code exactly.
26. No telemetry — zero data to AgentGrow servers.
27. Enable 2FA on the CWS publisher account.

### Quick Security Checklist (pre-PR)

- [ ] No `innerHTML` / `dangerouslySetInnerHTML` / `document.write` introduced
- [ ] No new permissions added to `manifest.json` without justification
- [ ] No API keys passed to content scripts or stored in sync storage
- [ ] All new `onMessage` handlers validate sender and payload shape
- [ ] All provider URLs validated (HTTPS or localhost/private IP only)
- [ ] `web_accessible_resources` still `[]` or restricted to specific origins
- [ ] `pnpm audit` passes with no high/critical issues
- [ ] react-markdown uses `rehype-sanitize` for any HTML output
- [ ] No remote scripts / CDN URLs in code
- [ ] Auth check (`ensureAuthenticated()`) present in every new message handler
- [ ] Raw Google OAuth token never sent outside the service worker
- [ ] DOM write targets validated (only form elements, valid CSS selector, guarded with try/catch)
- [ ] New DOM_* message types added to `DOM_RELAY_TYPES` set in service worker

---

## Stability & Reliability Rules

The extension must degrade gracefully at every layer — not silently. See design doc §10 for full architecture, diagrams, and implementation patterns.

### Core Rules

| Area | Rule |
|------|------|
| Service Worker | `ensureInitialized()` at the top of every event handler — never assume in-memory state survived |
| Service Worker | No module-level mutable state. All state loaded from `chrome.storage` on wake |
| Streaming keepalive | Alarm (`stream-keepalive`, every 24s) active while any stream is in progress |
| Streaming transport | Use named `Port` (`llm-stream`) — not `sendMessage` — for all token streaming |
| Port disconnect | `useServiceWorkerPort` reconnects with linear back-off; marks in-flight messages as errored |
| Request cancellation | Every `fetch` has an `AbortController`. Cancel on: Stop button, port disconnect, `onSuspend` |
| Timeouts | 15s connect timeout + 30s idle-token timeout on every LLM fetch |
| Storage writes | All writes through `safeStorageSet` (quota check before write, rotate at 8 MB) |
| Schema changes | `runMigrations()` in `onInstalled` + every SW wake. All migrations idempotent |
| React crashes | `ErrorBoundary` wraps every view independently. Crashes logged locally — no telemetry |
| Loading states | Every async operation has a skeleton/spinner. No blank areas while waiting |
| Content script timeout | 5s timeout on page extraction. Non-fatal — chat continues without page context |
| Provider health | `HealthChecker` caches status (5 min TTL). Shown in `NetworkStatusBar` before first message |
| Token render | `useStreamBuffer` batches tokens at 50ms — no per-token React state updates |
| Message list | `react-window` virtualisation for 500+ messages. Auto-scroll only when user is at bottom |
| Offline detection | `useNetworkStatus` disables input + shows banner when offline. Localhost providers exempt |
| Context invalidation | `chrome.runtime.id` polled every 10s. Non-dismissable reload banner on invalidation |

### Stability Checklist (pre-PR)

- [ ] All service worker state reads from storage, not module-level variables
- [ ] Every LLM fetch has an `AbortController` and a connect timeout
- [ ] Port disconnect handler calls `markStreamingMessagesAsError`
- [ ] New storage writes go through `safeStorageSet`
- [ ] New async operations have loading states (skeleton or spinner)
- [ ] New React views are wrapped in `<ErrorBoundary>`
- [ ] Content script failures time out gracefully (never block chat)
- [ ] Token streaming goes through `useStreamBuffer` (no per-token state updates)

---

## Design System

- **Theme**: dark, terminal-refined
- **Accent**: `#22d3a8` (emerald-teal)
- **Background**: `#0e0e11` base / `#16161d` surface
- **Fonts**: JetBrains Mono (mono/code) · DM Sans (UI) · Inter (body/chat)
- **Transitions**: 150ms max
- **Side panel width**: 400px (Chrome default)

Full tokens in `src/assets/styles/tokens.css`. Full UI design in design doc §7.

---

## Trust Features (summary)

First-class features — not afterthoughts. Full specification in design doc §6.

| ID | Feature | Where |
|----|---------|-------|
| T1 | Privacy Dashboard — shows exactly what is stored and where | Options → Privacy |
| T2 | Live Network Indicator — shows endpoint + status per request | Side panel status bar |
| T3 | Permission Explainer — each permission in plain English | Options → About Permissions |
| T4 | Open Source Verification — GitHub link + version + build hash | Side panel header, Options → About |
| T5 | Data Export & Deletion — one-click JSON export, full wipe | Options → Privacy |
| T6 | Audit Log — API call metadata only (no content), 500 entries | Options → Privacy → Network Log |
| T7 | Provider Security Badge — HTTPS/local/warning indicator | Provider list + side panel header |
| T8 | First-Run Transparency Screen → Google Sign-In — no dark patterns, no email capture | On install |
| T9 | Reproducible Build Badge — SHA-256 of zip published in CI | GitHub Releases |
| T10 | CWS Compliance Page — privacy policy, data disclosures | https://devops.gheware.com/agentgrow/ |

---

## Coding Conventions

| Kind | Convention |
|------|-----------|
| Class files | `PascalCase.ts` |
| Utility files | `camelCase.ts` |
| React components | `PascalCase.tsx` |
| Types / interfaces | PascalCase |
| Constants | `SCREAMING_SNAKE` |
| Message types | `SCREAMING_SNAKE` string enum |

- **Named exports everywhere** except React component files (`.tsx`)
- **Import order**: builtins → external packages → chrome → internal absolute → relative
- **Wrap `chrome.*` callbacks** in promisified helpers in `src/core/utils/chrome.ts`. No raw callbacks in business logic.
- **No default exports** except `.tsx` component files

---

## Development Phases

### Phase 1 — MVP (current — in progress)
- ✅ Google authentication (chrome.identity OAuth2)
- ✅ Provider management (7 presets: OpenRouter, OpenAI, Anthropic, Groq, Gemini, Ollama, Custom)
- ✅ Settings UI — inline in side panel (gear icon left of logo)
- ✅ Provider/model picker in chat header (OpenCode-familiar `provider › model`)
- ✅ Live DOM read — structured extraction (headings, forms, code blocks, links, selection)
- ✅ Live DOM write — form fill (React-compatible), text highlight + clear, cursor insert
- ✅ Smart context — auto-reads page + selection, no manual toggles
- ✅ LLM streaming chat — SSE (OpenAI-compatible) + NDJSON (Ollama) via named Port `llm-stream`
- ✅ Conversation persistence — active conversation saved to chrome.storage.local, restored on panel reopen
- ✅ Chat UX — New Chat, copy message, retry failed, timestamps, friendly error messages
- ✅ Error boundary wrapping entire side panel
- ✅ Save confirmation toast after provider test
- ✅ Provider selection persisted to chrome.storage.local
- ⬜ Multi-tab group summary
- ⬜ Prompt templates
- ⬜ Full test suite + reliability e2e
- ⬜ CI/CD, CWS submission

### Phase 2 — Agentic
Context menu integration, AI form-filling via chat command, structured data extraction to clipboard/JSON, tab group research briefs.

### Phase 3 — Power Features
Multi-provider routing, prompt chaining, scheduled tasks, Firefox port, import/export, optional shared template library.

---

## Release Process

1. Bump version in `manifest.json` and `package.json` (must match)
2. Update `CHANGELOG.md`
3. `pnpm typecheck && pnpm lint && pnpm test:coverage && pnpm audit`
4. `pnpm build:zip` → verify SHA-256
5. Tag `v1.2.3` → CI publishes GitHub Release with zip + `SHA256SUMS.txt`
6. Upload zip to CWS Developer Dashboard
7. Update version badge on `devops.gheware.com/agentgrow/`

**Semver guidance:** PATCH = bug fixes; MINOR = new features; MAJOR = manifest permission changes (triggers CWS re-review) or breaking storage format changes.

---

## Key References

- Chrome Extension MV3 docs: https://developer.chrome.com/docs/extensions
- Chrome Extension Security guide: https://developer.chrome.com/docs/extensions/mv3/security
- Chrome Web Store policies: https://developer.chrome.com/docs/webstore/program-policies
- OWASP Browser Extension Vulnerabilities: https://cheatsheetseries.owasp.org/cheatsheets/Browser_Extension_Vulnerabilities_Cheat_Sheet.html
- crxjs Vite plugin: https://crxjs.dev/vite-plugin
- Playwright extension testing: https://playwright.dev/docs/chrome-extensions
- OpenRouter API: https://openrouter.ai/docs
- Ollama API: https://github.com/ollama/ollama/blob/main/docs/api.md
- rehype-sanitize: https://github.com/rehypejs/rehype-sanitize
- Zod validation: https://zod.dev
