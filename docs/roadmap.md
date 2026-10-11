# Roadmap and feature status

Moved out of the root `CLAUDE.md` on 2026-10-11. Status reflects the code at that date; full target spec is in the (gitignored) design doc §3, §6 and §16.

## Core use cases
- **Form Automation** — auto-fill job applications, registrations, checkout forms, surveys
- **Email & Message Drafting** — compose emails in Gmail/Outlook, messages in Telegram/Slack
- **Document Tasks** — summarize articles, extract data (emails, links, tables, prices), create drafts
- **Site Navigation** — find information on complex sites, answer questions about page content
- **Data Extraction** — pull structured data from any page into usable formats


## Shipped features (v0.1.0 – v0.1.1)

1. **Side panel chat with streaming** — persistent AI chat alongside any webpage; SSE streaming (OpenAI-compatible providers) + NDJSON streaming (Ollama) via named Port `llm-stream`
2. **Conversation persistence** — active conversation saved to `chrome.storage.local`, restored on panel reopen
3. **Smart auto-context** — auto-reads page content + text selection automatically; no manual toggles needed
4. **Multi-model dropdown** — switch models in 1 click; shows all preset models per provider + dynamically fetched models from any endpoint
5. **Chat UX** — New Chat button, copy message to clipboard, retry failed messages, timestamps on hover
6. **DOM write** — form fill (React/Angular/Vue compatible via native setter + `InputEvent` + full event suite), contenteditable support (Telegram, Slack, Gmail, Notion), text highlight, cursor insert
7. **DOM click & navigate** — click any button/link by CSS selector, scrollIntoView, React-compatible MouseEvent dispatch
8. **Smart selector resolution** — 5-level fallback: id → name → aria-label → placeholder → positional
9. **Action safety mode** — "Ask before acting" (default, shows approve/cancel UI) vs "Auto-act" with persistent risk warning
10. **Provider management** — add/edit/delete any OpenAI-compatible endpoint or Ollama; 7 built-in presets (OpenRouter, OpenAI, Anthropic, Groq, Google Gemini, Ollama, Custom); save confirmation toast; provider selection persisted to `chrome.storage.local`
11. **Ollama Cloud support** — api.ollama.com with API key; auto-shows key field for non-localhost Ollama URLs
12. **Private network support** — test connection fallback via tab execution for 192.168.*/10.*/172.16.* servers (bypasses service worker fetch restrictions)
13. **Friendly error messages** — 401 → "Invalid API key", 429 → "Rate limited", 404 → "Model not found", 5xx → "Server error"; retry button on all errors
14. **Error boundary** — wraps entire side panel; React crashes show recovery UI instead of blank screen
15. **Page reader** — extracts fillable fields + clickable elements with verified CSS selectors, contenteditable detection, UI noise filtering, line deduplication
16. **Dynamic model discovery** — "Fetch models from endpoint" button in provider form; fetches `/v1/models` (OpenAI-compatible) or `/api/tags` (Ollama); cached per-provider; chat header dropdown merges preset + fetched models; works with private network fallback
17. **In-page activity toast** — shadow-DOM toast at bottom of active tab showing "AgentGrow is working/filling/clicking/typing on this tab" with pulsing indicator + **Stop** button; appears during LLM streaming and DOM write operations; Stop aborts the stream and clears all toasts

---
18. **Stream reliability** (post-v0.1.1, unreleased) — 15s connect / 90s idle timeouts with clear errors; reasoning/thinking tokens shown as a quoted block; page text cap raised to 30k chars

## Trust features

| ID | Feature | Where | Status |
|----|---------|-------|--------|
| T1 | Privacy dashboard — what is stored and where | Options → Privacy | Not built (options page is a stub) |
| T2 | Live network indicator — endpoint + status per request | Side panel status bar | Not built (`NetworkStatusBar` doesn't exist) |
| T3 | Permission explainer in plain English | Options → About | Not built |
| T4 | Open-source verification — GitHub link + version + build hash | Side panel header, Options → About | Not built in-extension |
| T5 | Data export & full wipe | Options → Privacy | Not built |
| T6 | Audit log — API call metadata only, 500 entries | Options → Privacy | Not built (`GET_AUDIT_LOG` enum only) |
| T7 | Provider security badge — HTTPS / local / warning | Provider list | Built (`providerSecurityTier` in `SettingsView`) |
| T8 | First-run transparency → Google sign-in, no dark patterns | On install | Sign-in screen built (`SignInView`) |
| T9 | Reproducible build — SHA-256 of the zip | GitHub Releases | Manual via `pnpm build:zip`; no CI |
| T10 | CWS compliance page — privacy policy, disclosures | https://devops.gheware.com/agentgrow/ | Live |

## Phase 1 — MVP (remaining)

- ⬜ v0.1.1 CWS approval (pending review)
- ✅ GitHub Release v0.1.1 — tag `v0.1.1` = `c063fd8`, exact submitted zip
- ⬜ v0.1.2 CWS upload (built + GitHub Release cut 2026-10-11)
- ⬜ Multi-tab group summary
- ⬜ Prompt templates
- ⬜ Options page — trust features T1/T3/T5/T6
- ⬜ Full test suite + Playwright e2e (only `url.test.ts` exists)
- ⬜ CI/CD pipeline

## Phase 2 — Agentic
Context menu integration, AI form-filling via chat command, structured data extraction to clipboard/JSON, tab group research briefs.

## Phase 3 — Power Features
Multi-provider routing, prompt chaining, scheduled tasks, Firefox port, import/export, optional shared template library.
