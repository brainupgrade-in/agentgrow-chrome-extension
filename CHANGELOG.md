# Changelog

## v0.1.3 — 2026-10-11

### Added
- **Buy Gheware AI credits from the extension:** "Buy credits or top up" link on the Gheware AI provider form, "Buy credits" / "Top up" on its Settings row, and a "Top up credits" link under the credit-used-up chat error. All open https://tokens.gheware-ai.com/buy in a new tab; payment and key delivery stay on the token service.
- Remaining Gheware AI credit shown on the provider's Settings row (`PROVIDER_BALANCE` → `tokens.gheware-ai.com/v1/balance`, sent only for a provider whose host is exactly `api.gheware-ai.com`).

### Changed
- Gheware gateway detection is an exact https + hostname match (`core/utils/gheware.ts`, tested) instead of a URL prefix test.
- Disclosures (README, store listing) cover the balance check.

No permission changes.

## v0.1.2 — 2026-10-11

### Added
- **Gheware AI** provider preset (`api.gheware-ai.com`, models `gw-qwen36-chat` / `gw-qwen36`) — optional prepaid endpoint operated by the publisher, used only if selected.
- Reasoning/thinking tokens (OpenAI-compatible and Ollama) render as a quoted "Thinking" block before the answer.

### Changed
- Streaming: 15 s connect and 90 s idle timeouts — a stalled provider now shows a clear error instead of a frozen activity toast.
- Page text sent as context raised from 8k to 30k characters.
- HTTP error mapping moved to `core/utils/errors.ts`; a LiteLLM "Budget has been exceeded" response now shows a friendly limit / top-up message.
- Data disclosures (README, store listing) now name the optional publisher-operated Gheware AI endpoint.

### Internal
- ESLint 9 flat config; unit tests for provider-URL validation and error mapping.

No permission changes since v0.1.1.

## v0.1.1 — 2026-04-21

- Removed unused permissions `tabGroups`, `alarms`, `contextMenus`, `notifications` (v0.1.0 CWS rejection "Purple Potassium").
- OAuth client bound to the published extension ID (rejection "Red Potassium").

## v0.1.0 — 2026-04-13

- Initial release.
