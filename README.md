# AgentGrow — Open-Source AI Browser Assistant

**Version: v0.1.0** · [Homepage](https://devops.gheware.com/agentgrow/) · [Chrome Web Store (in review)](https://chromewebstore.google.com/)

AgentGrow is an open-source Chrome extension (Manifest V3) that **automates common browser tasks** using AI — filling forms, drafting emails, summarizing articles, extracting data, and navigating complex sites. It connects to **any LLM provider** via a user-supplied API URL and key.

**No subscriptions. No vendor lock-in. No telemetry.**

---

## Why AgentGrow

- **Bring your own LLM** — OpenRouter, OpenAI, Anthropic, Groq, Google Gemini, Ollama (local or Cloud), or any OpenAI-compatible endpoint.
- **Live DOM read/write** — works directly on the adjacent tab. No screenshots, no snapshots.
- **Private by design** — API keys encrypted at rest (AES-GCM-256) and never leave the service worker. Zero data sent to AgentGrow servers.
- **Action safety mode** — "Ask before acting" by default; every form fill or click requires your approval. A visible in-page toast with a Stop button appears whenever the extension is controlling the tab.
- **Dynamic model discovery** — fetches available models from any endpoint. No more guessing model IDs for custom or self-hosted providers.
- **Open source** — full source in this repo. Reproducible builds with published SHA-256 hash.

### Core use cases
- Auto-fill job applications, registrations, checkout forms, surveys
- Compose emails in Gmail/Outlook, messages in Telegram/Slack
- Summarize articles and extract structured data
- Find information on complex sites, answer questions about page content

---

## Install (unpacked, while CWS review is in progress)

The extension has been submitted to the Chrome Web Store. While it is in review, you can install it directly from source:

### Option A — install from a pre-built zip

1. Download `agentgrow-v0.1.0.zip` from the [GitHub Releases](https://github.com/brainupgrade-in/agentgrow-chrome-extension/releases) page.
2. Verify the SHA-256 hash against `SHA256SUMS.txt` (optional but recommended).
3. Unzip to a folder of your choice.
4. Open `chrome://extensions` in Chrome.
5. Toggle **Developer mode** (top right).
6. Click **Load unpacked** and select the unzipped folder.
7. Pin the AgentGrow icon to your toolbar.

### Option B — build from source

```bash
git clone https://github.com/brainupgrade-in/agentgrow-chrome-extension.git
cd agentgrow-chrome-extension/app
pnpm install
pnpm build
```

Then load the `dist/` folder via `chrome://extensions` → **Load unpacked**.

### First run

1. Click the AgentGrow icon to open the side panel.
2. Sign in with Google (required — auth gate protects all features).
3. Open **Settings** (gear icon) → **Add Provider** → pick a preset (OpenRouter, OpenAI, Ollama, etc.) and paste your API key.
4. Click **Test** to verify the connection, then **Save**.
5. Start chatting. The extension auto-reads the current page and your text selection.

---

## Security

Security is a first-class concern. Key protections:

- **Encrypted key storage** — API keys stored with AES-GCM-256 in `chrome.storage.local`; never in plaintext, never synced to Google.
- **Least-privilege keys** — keys are confined to the service worker. Content scripts, the side panel, and the options page never see raw key values.
- **Auth-gated messaging** — every service-worker message handler validates a Google auth token before acting.
- **Zod-validated messages** — all cross-context payloads validated at the boundary.
- **Strict CSP** — `script-src 'self'; object-src 'none'; base-uri 'none';` — no eval, no inline scripts, no CDN loads.
- **Sanitized markdown** — `rehype-sanitize` on all rendered LLM output. No `innerHTML`, no `dangerouslySetInnerHTML` anywhere.
- **Action safety mode** — DOM writes (fill / click / submit) require explicit user approval by default.
- **HTTPS-only providers** — `http://` accepted only for `localhost` and private IP ranges.
- **No telemetry** — zero network traffic to AgentGrow servers. Audit log of LLM calls is stored locally and viewable in Options.
- **Reproducible builds** — submission zip SHA-256 published alongside each release.

A full threat model, permissions rationale, and the complete security rule-set are documented in [`CLAUDE.md`](./CLAUDE.md) and the architecture design doc.

---

## Feedback, bugs, feature requests

Please open an issue — bugs, feature ideas, and security reports are all welcome:

**→ https://github.com/brainupgrade-in/agentgrow-chrome-extension/issues**

For security-sensitive disclosures, please mark the issue accordingly or reach out via the contact link on [devops.gheware.com/agentgrow](https://devops.gheware.com/agentgrow/).

---

## License

Open source. See repository for license details.
