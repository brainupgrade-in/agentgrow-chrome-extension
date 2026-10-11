# app/CLAUDE.md — extension source

Loaded when working under `app/`. Repo-wide rules (security, commands, status) are in the root `CLAUDE.md`.

Stack: Vite 5 + `@crxjs/vite-plugin` · TypeScript strict · React 18 · Zustand · Tailwind + CSS vars · react-markdown + remark-gfm + rehype-sanitize · Zod · Lucide · Vitest · pnpm.

## Source map (≈5k lines total)

| Path | Lines | What it does |
|---|---|---|
| `src/background/index.ts` | 1288 | **Everything in the SW.** `handleMessage` router (switch on `MessageType`, auth gate first), `readPageDirect` / `readSelectionDirect` (inline `executeScript` page reads, `MAX_TEXT` 30k), `fillFormDirect`, `clickDirect`, `relayToDomScript` (writes → content script), `setActivity` / `clearActivityEverywhere` (toast), `PROVIDER_TEST` / `PROVIDER_LIST_MODELS` (fetches `/models` or Ollama `/api/tags`, cached as `modelsCache:<baseUrl>` in `chrome.storage.local`) incl. private-network fallback via tab execution, `llm-stream` Port handler (SSE + Ollama NDJSON streaming, timeouts, reasoning tokens), `runMigrations` |
| `src/background/AuthService.ts` | 114 | Google sign-in via `chrome.identity.getAuthToken` (OAuth **access** token, not an ID token) → `oauth2/v3/userinfo`; session in `chrome.storage.session` |
| `src/background/KeyVault.ts` | 93 | AES-GCM-256 encrypt/decrypt of API keys |
| `src/background/ProviderManager.ts` | 118 | Provider CRUD + default provider, via `safeStorageSet` |
| `src/content/index.ts` | 503 | DOM writes (fill incl. contenteditable, click, highlight/clear marks, insert at cursor), closed-shadow-root activity toast + Stop, `__PING__` readiness |
| `src/core/types/messages.ts` | 63 | `MessageType` enum + `AgentGrowMessageSchema` (Zod) |
| `src/core/types/provider.ts` | 162 | `ProviderConfig`, `PROVIDER_PRESETS` (openrouter, openai, anthropic, groq, gemini, ollama, custom) |
| `src/core/types/{auth,dom,conversation}.ts` | — | Shared types |
| `src/core/utils/storage.ts` | 32 | `safeStorageSet` (quota guard) |
| `src/core/utils/url.ts` | 52 | `isAllowedProviderUrl`, `providerSecurityTier` (+ `url.test.ts`) |
| `src/sidepanel/App.tsx` | 73 | Screen router: chat / settings / provider-add / provider-edit; sign-in gate |
| `src/sidepanel/views/ChatView.tsx` | 834 | Chat shell, auto page/selection context, streaming render, action approve/cancel, model dropdown, conversation persistence (`activeConversation` in `chrome.storage.local`) |
| `src/sidepanel/views/ProviderFormView.tsx` | 446 | Add/edit provider, presets, test connection, "Fetch models from endpoint" |
| `src/sidepanel/views/{SettingsView,SignInView}.tsx` | — | Provider list (+ security badge), Google sign-in screen |
| `src/sidepanel/hooks/{useAuth,usePageContext}.ts` | — | Auth state; page-context read + selection polling (1.5s) |
| `src/sidepanel/store/providerStore.ts` | 179 | Zustand provider list + active selection |
| `src/sidepanel/components/ErrorBoundary.tsx` | 49 | Wraps the whole side panel (`main.tsx`) |
| `src/sidepanel/styles/index.css` | 180 | Design tokens (`--ag-*`) + Tailwind |
| `src/options/main.tsx` | 28 | **Stub** — "coming in Phase 1" |
| `scripts/zip.mjs` | — | `build:zip`: zips `../dist`, writes `SHA256SUMS.txt` |
| `scripts/setup-worktree.sh` | — | Prepares a git worktree (copies gitignored docs, `pnpm install`) |

## Implemented vs target

The design doc (and the pre-2026-10 CLAUDE.md) specify several things that **do not exist in code**. Don't import or extend them as if they did:

| Specified | Reality |
|---|---|
| `ILLMProvider` + `OpenAICompatibleProvider` / `OllamaProvider` classes in `src/core/providers/` | No provider classes. Streaming and `/models` calls are inline in `background/index.ts`, branching on `provider.type` (`'openai-compatible'` vs Ollama) |
| `react-window` virtualisation, `useStreamBuffer` (50ms token batching), `useServiceWorkerPort` reconnect, `markStreamingMessagesAsError` | None exist. Tokens are posted per chunk over the Port and rendered by `ChatView` |
| `HealthChecker` + `NetworkStatusBar`, `useNetworkStatus` offline banner | Not implemented |
| `stream-keepalive` alarm, `onSuspend` cancellation | Not implemented, and the `alarms` permission was removed in v0.1.1 — don't reintroduce it without a CWS justification |
| `chrome.runtime.id` polling for context invalidation | Not implemented |
| `ensureInitialized()` loads state from storage | Exists but is a no-op flag |
| `src/core/utils/chrome.ts` promisified wrappers | Doesn't exist; code calls `chrome.*` directly (some callback style, e.g. `AuthService`) |
| `src/assets/styles/tokens.css` | Tokens live in `src/sidepanel/styles/index.css` |
| Options page: privacy dashboard (T1), permission explainer (T3), export/delete (T5), audit log (T6) | Stub. `MessageType.GET_AUDIT_LOG` exists but nothing handles it |
| Incognito detection; URL re-validation at call time | Not implemented (see root `CLAUDE.md` known gaps) |

## Reliability rules that ARE in force

- Every LLM fetch has an `AbortController`; Stop / `CHAT_STOP` / port disconnect abort it.
- Streams: 15s connect timeout, 90s idle-token timeout (any byte resets it); a stall posts a clear `error` to the Port instead of hanging.
- Activity toast is hidden in `finally` blocks and on Port disconnect; `CHAT_STOP` clears toasts in all tabs.
- Storage writes that can grow go through `safeStorageSet`.
- Schema changes go in `runMigrations()` (idempotent, keyed on `schemaVersion`).
- Page extraction failures are non-fatal — chat continues without page context.

## Conventions

- Files: classes `PascalCase.ts`, utils `camelCase.ts`, components `PascalCase.tsx`. Constants `SCREAMING_SNAKE`; message types are a `SCREAMING_SNAKE` string enum.
- Named exports everywhere, views included (`export function ChatView`). Only `sidepanel/App.tsx` has a default export.
- Imports: builtins → external → chrome → internal → relative. Relative imports use the `.js` suffix (e.g. `'../../core/utils/url.js'`).
- Tests sit next to the code as `*.test.ts` (Vitest, jsdom available). Add one when touching pure logic.

## Design system

Dark, terminal-refined. Accent `#22d3a8`; bg `#0e0e11` / surface `#16161d` (`--ag-*` vars in `src/sidepanel/styles/index.css`, `ag-*` Tailwind classes). Fonts: JetBrains Mono (code), DM Sans (UI), Inter (chat). Transitions ≤150ms. Side panel width 400px.
