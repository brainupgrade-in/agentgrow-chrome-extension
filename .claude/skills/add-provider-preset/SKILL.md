---
name: add-provider-preset
description: Add or update a built-in LLM provider preset in AgentGrow (e.g. Mistral, DeepSeek, Together, xAI, a new Ollama-style host) or refresh a preset's curated model list. Use when the user wants a new provider in the preset picker or updated default models.
---

# Add / update a provider preset

Presets live in `PROVIDER_PRESETS` in `app/src/core/types/provider.ts` (current ids: openrouter, openai, anthropic, groq, gemini, ollama, custom). There are no provider classes — the service worker branches on `type`:

- `'openai-compatible'` → `POST {baseUrl}/chat/completions` (SSE), `GET {baseUrl}/models` for discovery.
- `'ollama'` → `POST {baseUrl}/api/chat` (NDJSON), `GET {baseUrl}/api/tags`.

Steps:
1. Confirm the provider really speaks one of those two protocols (check its docs for an OpenAI-compatible base URL). If it doesn't, stop — a new protocol is a larger change in `background/index.ts` streaming code, not a preset.
2. Add an entry mirroring the existing ones: `id` (kebab, unique), `name`, `type`, `baseUrl` (HTTPS — Security rule 6; `http://` only for localhost/private IPs), `defaultModel`, curated `models` (verify current model ids against the provider's docs — don't invent them), key placeholder, docs URL, `requiresKey`. Keep `custom` last.
3. Streaming nuances are already handled in `background/index.ts`: `delta.content`, `delta.reasoning_content` / `delta.reasoning` (rendered as a "Thinking" block), Ollama `message.thinking`. If the provider uses a different field for reasoning or needs extra headers, add that there and note it.
4. Check `ProviderFormView.tsx` still renders the preset correctly (key field visibility follows `requiresKey`; non-localhost Ollama shows the key field).
5. Gates: `pnpm -C app typecheck && pnpm -C app lint && pnpm -C app test && pnpm -C app build`.
6. If the preset should appear in store copy, update `store-listing.md` (gitignored) and `README.md`'s provider list.

No manifest change is needed — provider calls use the existing `<all_urls>` host permission.
