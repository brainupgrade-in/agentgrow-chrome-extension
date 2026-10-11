---
name: add-dom-action
description: Add a new DOM write/action capability to AgentGrow (a new MessageType the service worker relays to the content script, plus the LLM action block that triggers it). Use when adding things like select-option, scroll, submit, type-into, drag, or any new way the extension acts on a page.
---

# Add a DOM action end to end

A DOM write touches five places. Miss one and it silently does nothing or bypasses a safety rule. Reads are different — they run inline via `chrome.scripting.executeScript` in the service worker (`readPageDirect`), not via the content script.

1. **Message type** — `app/src/core/types/messages.ts`: add `DOM_<VERB>` to `MessageType` (SCREAMING_SNAKE string enum). `AgentGrowMessageSchema` validates only `type/requestId/source`; `payload` is an untyped record, so validate the payload fields with Zod where they are consumed.
2. **Service worker relay** — `app/src/background/index.ts`:
   - add it to `DOM_WRITE_TYPES` (this puts it behind `ensureAuthenticated()` and routes it through `relayToDomScript`);
   - add a toast label in the `label` chain in `handleMessage` (e.g. `'is selecting on this tab'`). The `setActivity(…, false)` cleanup in the existing `finally` covers it — don't add a second toast path.
   - add a direct-execution fallback in `relayToDomScript` only if the action must work when the content script is unavailable.
3. **Content script** — `app/src/content/index.ts`: add a `case MessageType.DOM_<VERB>` in the `chrome.runtime.onMessage` switch. Rules: wrap `querySelector` in try/catch (bad selectors throw); for value changes use the native setter + `InputEvent` + focus/input/change/blur; never `innerHTML`; return `{ success, error? }` and call `sendResponse`.
4. **Side panel trigger** — `app/src/sidepanel/views/ChatView.tsx` `executeActions()`: parse a new fenced block (`agentgrow-<verb>`) like the existing `agentgrow-fill` / `agentgrow-click`, validate it with a Zod schema (bounded lengths/counts), and send the message. It must respect `actionMode` — in "ask" mode the action goes through the approve/cancel UI, never straight to execution.
5. **System prompt** — `app/src/background/index.ts`, the chat system prompt (search `CLICKABLE ELEMENTS`): document the new block's exact JSON shape and when to use it; keep the "only use selectors listed in FILLABLE FIELDS / CLICKABLE ELEMENTS" rule.

Then:
- Add a unit test for any pure parsing/validation logic you extracted (`*.test.ts` next to it).
- `pnpm -C app typecheck && pnpm -C app lint && pnpm -C app test && pnpm -C app build`.
- Manual check: load `dist/` unpacked (sign-in fails on unpacked builds — test the content-script handler from DevTools if needed) and confirm the toast appears and clears.
- If the action needs a new Chrome permission, stop and ask — that is a CWS re-review (`docs/cws-and-release.md`).
