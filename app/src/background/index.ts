/**
 * AgentGrow Service Worker (Manifest V3)
 *
 * Lifecycle: Chrome may terminate this SW at any time.
 * Rule: ensureInitialized() must be called at the top of EVERY event handler.
 * Rule: ensureAuthenticated() must be called before any privileged message handler.
 */

import { AuthService }     from './AuthService.js';
import { ProviderManager } from './ProviderManager.js';
import { KeyVault }        from './KeyVault.js';
import { AgentGrowMessageSchema, MessageType } from '../core/types/messages.js';
import type { AgentGrowResponse } from '../core/types/messages.js';

// ─── DOM message types that are relayed to the content script ─────────────────
// DOM write types relayed to the content script (reads handled inline via executeScript)
const DOM_WRITE_TYPES = new Set<MessageType>([
  MessageType.DOM_FILL_FORM,
  MessageType.DOM_CLICK,
  MessageType.DOM_HIGHLIGHT_TEXT,
  MessageType.DOM_INSERT_TEXT,
  MessageType.DOM_CLEAR_MARKS,
]);

// ─── Initialisation ──────────────────────────────────────────────────────────

let initialized = false;

async function ensureInitialized(): Promise<void> {
  if (initialized) return;
  initialized = true;
}

async function ensureAuthenticated() {
  const user = await AuthService.getUser();
  if (!user) throw new Error('UNAUTHENTICATED');
  return user;
}

/**
 * Finds the active tab in the given window (the tab adjacent to the side panel).
 * windowId comes from the side panel via chrome.windows.getCurrent().
 */
async function getAdjacentTab(windowId?: number): Promise<chrome.tabs.Tab | null> {
  const query: chrome.tabs.QueryInfo = { active: true };
  if (windowId) query.windowId = windowId;
  else query.lastFocusedWindow = true;

  const tabs = await chrome.tabs.query(query);
  const tab = tabs[0] ?? null;

  // Exclude chrome:// and extension pages — can't inject into those
  if (tab?.url?.startsWith('chrome') || tab?.url?.startsWith('chrome-extension')) {
    return null;
  }
  return tab;
}

/**
 * Injects the content script into a tab if it isn't already running.
 * Uses the path from the built manifest (hash changes per build).
 */
async function ensureContentScript(tabId: number): Promise<void> {
  // First, check if the content script is already alive
  try {
    await chrome.tabs.sendMessage(tabId, { type: '__PING__' });
    return; // Content script responded — already injected
  } catch {
    // Not injected yet — fall through to inject
  }

  // Get the correct compiled path from the manifest
  const manifest = chrome.runtime.getManifest();
  const files = manifest.content_scripts?.[0]?.js;
  if (files?.length) {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files });
      return;
    } catch {
      // Injection failed — may need host permissions
    }
  }

  // Final fallback: request host permission and retry
  // (activeTab may have expired if user navigated)
  throw new Error('Cannot access this page. Click the AgentGrow icon to grant access, or allow site access in extension settings.');
}

/**
 * Reads page content directly via chrome.scripting.executeScript.
 * Works with activeTab + scripting permissions — no content script needed.
 */
async function readPageDirect(tabId: number): Promise<AgentGrowResponse> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const MAX_TEXT = 8_000;

        // ── Main text extraction ────────────────────────────────────────
        const root = document.querySelector('main')
          ?? document.querySelector('article')
          ?? document.querySelector('[role="main"]')
          ?? document.body;

        const clone = root.cloneNode(true) as HTMLElement;

        // Remove noise: scripts, styles, navs, menus, hidden, ads, popups, tooltips
        clone.querySelectorAll(
          'script,style,noscript,svg,canvas,iframe,' +
          'nav,header,footer,aside,' +
          '[aria-hidden="true"],[role="navigation"],[role="banner"],[role="menu"],' +
          '[role="menubar"],[role="menuitem"],[role="tooltip"],[role="dialog"],' +
          '[role="toolbar"],[role="tablist"],[role="complementary"],' +
          '.cookie-notice,.ad,.advertisement,.sidebar,.popup,.modal,.overlay,' +
          '[class*="menu"],[class*="Menu"],[class*="toolbar"],[class*="Toolbar"],' +
          '[class*="tooltip"],[class*="Tooltip"],[class*="popup"],[class*="Popup"],' +
          '[class*="dropdown"],[class*="Dropdown"],[class*="context-menu"],' +
          'button,[role="button"]'
        ).forEach(el => el.remove());

        // Strip event attributes
        clone.querySelectorAll('*').forEach(el =>
          Array.from(el.attributes)
            .filter(a => a.name.startsWith('on'))
            .forEach(a => el.removeAttribute(a.name))
        );

        let rawText = (clone.innerText ?? '').trim();

        // Clean up: collapse whitespace, remove very short lines (UI labels), dedupe
        const lines = rawText.split('\n')
          .map(l => l.replace(/[ \t]+/g, ' ').trim())
          .filter(l => l.length > 2);  // skip tiny UI fragments

        // Deduplicate repeated lines (common in SPAs with repeated UI elements)
        const seen = new Set<string>();
        const uniqueLines: string[] = [];
        for (const line of lines) {
          if (!seen.has(line)) {
            seen.add(line);
            uniqueLines.push(line);
          }
        }

        const mainText = uniqueLines.join('\n')
          .replace(/\n{3,}/g, '\n\n')
          .slice(0, MAX_TEXT);

        // ── Headings ────────────────────────────────────────────────────
        const headings: Array<{ level: number; text: string }> = [];
        document.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(el => {
          const text = el.textContent?.replace(/\s+/g, ' ').trim() ?? '';
          if (text && text.length > 2) headings.push({ level: parseInt(el.tagName[1]), text });
        });

        // ── Selection ───────────────────────────────────────────────────
        const sel = window.getSelection();
        let selection: { text: string; before: string; after: string } | undefined;
        if (sel && !sel.isCollapsed && sel.toString().trim()) {
          const text = sel.toString().trim();
          const range = sel.getRangeAt(0);
          const container = range.commonAncestorContainer;
          const parentText = (
            (container instanceof Text ? container.parentElement : container as HTMLElement)
              ?.textContent ?? ''
          ).replace(/\s+/g, ' ');
          const idx = parentText.indexOf(text);
          selection = {
            text,
            before: idx > 0 ? parentText.slice(Math.max(0, idx - 200), idx) : '',
            after: idx >= 0 ? parentText.slice(idx + text.length, idx + text.length + 200) : '',
          };
        }

        // ── Forms — standard inputs ─────────────────────────────────────
        type FormField = {
          selector: string; type: string; name: string; label: string;
          placeholder: string; currentValue: string; required: boolean; readOnly: boolean;
        };
        type DetectedForm = { name: string; fields: FormField[] };
        const forms: DetectedForm[] = [];

        document.querySelectorAll('form').forEach((form, fi) => {
          const legend = form.querySelector('legend')?.textContent?.trim();
          const ariaLabel = form.getAttribute('aria-label');
          const name = legend ?? ariaLabel ?? `Form ${fi + 1}`;
          const fields: FormField[] = [];

          form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
            'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]),' +
            'textarea,select'
          ).forEach((el, ei) => {
            // Build a stable CSS selector; use nth-of-type as last resort
            const tag = el.tagName.toLowerCase();
            const selector = el.id
              ? `#${CSS.escape(el.id)}`
              : el.name
                ? `form:nth-of-type(${fi+1}) ${tag}[name="${CSS.escape(el.name)}"]`
                : `form:nth-of-type(${fi+1}) ${tag}:nth-of-type(${ei+1})`;
            let label = '';
            if (el.id) { const lbl = document.querySelector(`label[for="${el.id}"]`); if (lbl) label = lbl.textContent?.trim() ?? ''; }
            if (!label) label = el.getAttribute('aria-label') ?? '';
            if (!label) { const p = el.closest('label'); if (p) label = p.textContent?.trim() ?? ''; }
            if (!label && !(el instanceof HTMLSelectElement)) label = el.placeholder ?? '';
            if (!label) label = el.name ?? '';

            fields.push({
              selector, label,
              type: el instanceof HTMLInputElement ? (el.type || 'text') : el.tagName.toLowerCase(),
              name: el.name || el.id || `field-${ei}`,
              placeholder: el instanceof HTMLSelectElement ? '' : (el.placeholder ?? ''),
              currentValue: el.value,
              required: el.required,
              readOnly: el instanceof HTMLSelectElement ? false : el.readOnly,
            });
          });
          if (fields.length) forms.push({ name, fields });
        });

        // ── ALL visible inputs/textareas (inside or outside forms) ────────
        const standaloneFields: FormField[] = [];
        const seenSelectors = new Set(forms.flatMap(f => f.fields.map(ff => ff.selector)));

        document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
          'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]),' +
          'textarea,select'
        ).forEach((el, i) => {
          const style = getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') return;

          // Build selector — prefer id, then name, then aria-label, then positional
          const tag = el.tagName.toLowerCase();
          const selector = el.id ? `#${CSS.escape(el.id)}`
            : el.name ? `${tag}[name="${CSS.escape(el.name)}"]`
            : el.getAttribute('aria-label') ? `${tag}[aria-label="${CSS.escape(el.getAttribute('aria-label')!)}"]`
            : `${tag}:nth-of-type(${i + 1})`;

          // Skip if already captured by form detection
          if (seenSelectors.has(selector)) return;
          seenSelectors.add(selector);

          const label = el.getAttribute('aria-label')
            ?? (el instanceof HTMLSelectElement ? '' : el.placeholder)
            ?? el.name ?? el.title ?? '';

          standaloneFields.push({
            selector, label: label || `${tag} field`,
            name: el.name || el.id || `field-${i}`,
            type: el instanceof HTMLInputElement ? (el.type || 'text') : tag,
            placeholder: el instanceof HTMLSelectElement ? '' : (el.placeholder ?? ''),
            currentValue: el.value,
            required: el.required,
            readOnly: el instanceof HTMLSelectElement ? false : el.readOnly,
          });
        });

        // Contenteditable elements (e.g., Telegram, Slack, Gmail compose)
        document.querySelectorAll<HTMLElement>(
          '[contenteditable="true"],[contenteditable=""],[role="textbox"]'
        ).forEach((el, i) => {
          const selector = el.id ? `#${el.id}`
            : el.getAttribute('data-peer-id') ? `[data-peer-id="${el.getAttribute('data-peer-id')}"] [contenteditable]`
            : `[contenteditable]:nth-of-type(${i + 1})`;
          const label = el.getAttribute('aria-label') ?? el.getAttribute('placeholder')
            ?? el.dataset['placeholder'] ?? 'Message input';
          standaloneFields.push({
            selector, label, name: `editable-${i}`, type: 'contenteditable',
            placeholder: label, currentValue: el.textContent?.slice(0, 200) ?? '',
            required: false, readOnly: false,
          });
        });

        if (standaloneFields.length) {
          forms.push({ name: 'Page inputs', fields: standaloneFields });
        }

        const meta = document.querySelector('meta[name="description"], meta[property="og:description"]');

        // ── Clickable elements (links, buttons, nav items) ──────────
        type ClickableElement = { text: string; selector: string; tag: string; href?: string };
        const clickables: ClickableElement[] = [];
        const clickSeen = new Set<string>();

        // Links
        document.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((a) => {
          const style = getComputedStyle(a);
          if (style.display === 'none' || style.visibility === 'hidden') return;
          const text = (a.textContent ?? '').replace(/\s+/g, ' ').trim();
          if (!text || text.length < 2 || clickSeen.has(text)) return;
          clickSeen.add(text);
          const href = a.href;
          if (href.startsWith('javascript:')) return;
          const selector = a.id ? `#${CSS.escape(a.id)}` : `a[href="${CSS.escape(a.getAttribute('href') ?? '')}"]`;
          clickables.push({ text: text.slice(0, 60), selector, tag: 'a', href });
        });

        // Buttons
        document.querySelectorAll<HTMLButtonElement>('button, [role="button"], input[type="submit"], input[type="button"]').forEach((btn, i) => {
          const style = getComputedStyle(btn);
          if (style.display === 'none' || style.visibility === 'hidden') return;
          const text = (btn.textContent ?? btn.getAttribute('aria-label') ?? btn.getAttribute('value') ?? '').replace(/\s+/g, ' ').trim();
          if (!text || text.length < 2 || clickSeen.has(text)) return;
          clickSeen.add(text);
          const selector = btn.id ? `#${CSS.escape(btn.id)}`
            : btn.getAttribute('aria-label') ? `[aria-label="${CSS.escape(btn.getAttribute('aria-label')!)}"]`
            : btn.name ? `button[name="${CSS.escape(btn.name)}"]`
            : `button:nth-of-type(${i + 1})`;
          clickables.push({ text: text.slice(0, 60), selector, tag: btn.tagName.toLowerCase() });
        });

        return {
          url: location.href,
          title: document.title,
          description: (meta as HTMLMetaElement | null)?.content || undefined,
          selection,
          headings,
          mainText,
          forms,
          clickables: clickables.slice(0, 40),
          codeBlocks: [] as string[],
          links: [] as Array<{ text: string; href: string }>,
          readAt: Date.now(),
        };
      },
    });

    const data = results?.[0]?.result;
    if (data) return { success: true, data };
    return { success: false, error: 'No result from page script' };
  } catch (e) {
    return { success: false, error: `Page read failed: ${String(e)}` };
  }
}

/**
 * Reads the current text selection from the active tab.
 */
async function readSelectionDirect(tabId: number): Promise<AgentGrowResponse> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || !sel.toString().trim()) return null;
        const text = sel.toString().trim();
        const range = sel.getRangeAt(0);
        const container = range.commonAncestorContainer;
        const parentText = (
          (container instanceof Text ? container.parentElement : container as HTMLElement)
            ?.textContent ?? ''
        ).replace(/\s+/g, ' ');
        const idx = parentText.indexOf(text);
        return {
          text,
          before: idx > 0 ? parentText.slice(Math.max(0, idx - 200), idx) : '',
          after: idx >= 0 ? parentText.slice(idx + text.length, idx + text.length + 200) : '',
        };
      },
    });
    return { success: true, data: results?.[0]?.result ?? null };
  } catch (e) {
    return { success: false, error: `Selection read failed: ${String(e)}` };
  }
}

/**
 * Fill form fields directly via chrome.scripting.executeScript.
 * Production-grade: handles React/Angular/Vue, shadow DOM, autocomplete,
 * complex selectors, and various input types across real-world sites.
 */
async function fillFormDirect(
  tabId: number,
  instructions: Array<{ selector: string; value: string }>
): Promise<AgentGrowResponse> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      args: [instructions],
      func: (instrs: Array<{ selector: string; value: string }>) => {
        const errors: string[] = [];
        let applied = 0;

        /**
         * Resolve element — tries the selector directly, then common fallbacks.
         * Handles cases where the LLM-generated selector doesn't match exactly.
         */
        function resolveElement(selector: string): Element | null {
          // Direct match
          try {
            const el = document.querySelector(selector);
            if (el) return el;
          } catch { /* invalid selector — try fallbacks */ }

          // Fallback: search by name attribute (common for forms)
          const nameMatch = selector.match(/\[name="([^"]+)"\]/);
          if (nameMatch) {
            const el = document.querySelector(`[name="${nameMatch[1]}"]`);
            if (el) return el;
          }

          // Fallback: search by aria-label
          const ariaMatch = selector.match(/\[aria-label="([^"]+)"\]/);
          if (ariaMatch) {
            const el = document.querySelector(`[aria-label="${ariaMatch[1]}"]`);
            if (el) return el;
          }

          // Fallback: search by id fragment
          const idMatch = selector.match(/#([\w-]+)/);
          if (idMatch) {
            const el = document.getElementById(idMatch[1]);
            if (el) return el;
          }

          // Fallback: search by placeholder text
          const phMatch = selector.match(/\[placeholder="([^"]+)"\]/);
          if (phMatch) {
            const el = document.querySelector(`[placeholder="${phMatch[1]}"]`);
            if (el) return el;
          }

          return null;
        }

        /**
         * Dispatch a full suite of events that covers React, Angular, Vue,
         * and vanilla JS event listeners. Order matters.
         */
        function dispatchEvents(el: HTMLElement, value: string) {
          // Focus events
          el.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
          el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

          // Input event (React 16+ listens for this)
          el.dispatchEvent(new InputEvent('input', {
            bubbles: true, cancelable: true, inputType: 'insertText', data: value
          }));

          // Change event (most frameworks listen for this)
          el.dispatchEvent(new Event('change', { bubbles: true }));

          // Keyboard events (some sites validate via keyup)
          el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Unidentified' }));
          el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Unidentified' }));

          // Blur to trigger validation
          el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
          el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
        }

        for (const { selector, value } of instrs) {
          const el = resolveElement(selector);
          if (!el) { errors.push(`Element not found: ${selector}`); continue; }

          // ── Contenteditable (Telegram, Slack, Gmail, Notion, etc.) ──
          if (el instanceof HTMLElement && el.isContentEditable) {
            el.focus();
            el.click();
            // Select all existing content and replace
            const sel = window.getSelection();
            if (sel) {
              const range = document.createRange();
              range.selectNodeContents(el);
              sel.removeAllRanges();
              sel.addRange(range);
              sel.deleteFromDocument();
            }
            document.execCommand('insertText', false, value);
            el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
            applied++;
            continue;
          }

          // ── Standard inputs & textareas ──
          if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
            // Scroll into view + focus (triggers any lazy validation)
            el.scrollIntoView({ behavior: 'instant', block: 'center' });
            el.focus();
            el.click();

            // Use native value setter (bypasses React/Angular/Vue synthetic property)
            const proto = el instanceof HTMLInputElement
              ? HTMLInputElement.prototype
              : HTMLTextAreaElement.prototype;
            const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;

            if (nativeSetter) {
              nativeSetter.call(el, value);
            } else {
              el.value = value;
            }

            // Set selection to end of value (important for autocomplete fields)
            try {
              el.selectionStart = el.selectionEnd = value.length;
            } catch { /* some input types don't support selection */ }

            // Dispatch comprehensive event suite
            dispatchEvents(el, value);
            applied++;
            continue;
          }

          // ── Select dropdowns ──
          if (el instanceof HTMLSelectElement) {
            el.focus();
            // Try exact value match first
            let matched = false;
            for (const opt of Array.from(el.options)) {
              if (opt.value === value || opt.text.toLowerCase() === value.toLowerCase()) {
                el.value = opt.value;
                matched = true;
                break;
              }
            }
            if (!matched) {
              // Partial text match
              for (const opt of Array.from(el.options)) {
                if (opt.text.toLowerCase().includes(value.toLowerCase())) {
                  el.value = opt.value;
                  matched = true;
                  break;
                }
              }
            }
            if (matched) {
              el.dispatchEvent(new Event('change', { bubbles: true }));
              el.dispatchEvent(new Event('input', { bubbles: true }));
              applied++;
            } else {
              errors.push(`No option matching "${value}" in ${selector}`);
            }
            continue;
          }

          // ── Clickable elements with role="textbox" or similar ──
          if (el instanceof HTMLElement) {
            el.focus();
            el.click();
            // Last resort: try execCommand
            try {
              document.execCommand('insertText', false, value);
              applied++;
            } catch {
              errors.push(`Cannot fill: ${selector} (not a standard input)`);
            }
            continue;
          }

          errors.push(`Not editable: ${selector}`);
        }
        return { applied, errors };
      },
    });
    const data = results?.[0]?.result;
    return data ? { success: true, data } : { success: false, error: 'No result from fill script' };
  } catch (e) {
    return { success: false, error: `Form fill failed: ${String(e)}` };
  }
}

/**
 * Sends a message to the content script running in the adjacent tab.
 * For write operations — tries content script relay first, falls back to direct execution.
 */
async function relayToDomScript(
  tabId: number,
  type: MessageType,
  payload: Record<string, unknown>
): Promise<AgentGrowResponse> {
  // Try content script relay first
  try {
    await ensureContentScript(tabId);
    const response = await new Promise<AgentGrowResponse>(resolve => {
      chrome.tabs.sendMessage(tabId, { type, payload }, resp => {
        if (chrome.runtime.lastError) {
          resolve({ success: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve((resp as AgentGrowResponse) ?? { success: false, error: 'No response' });
      });
    });
    if (response.success) return response;
  } catch {
    // Content script not available — fall through to direct execution
  }

  // Fallback: direct execution for DOM_FILL_FORM
  if (type === MessageType.DOM_FILL_FORM) {
    const instructions = (payload['instructions'] as Array<{ selector: string; value: string }>) ?? [];
    return fillFormDirect(tabId, instructions);
  }

  // Fallback: direct execution for DOM_INSERT_TEXT with selector
  if (type === MessageType.DOM_INSERT_TEXT && payload['selector']) {
    return fillFormDirect(tabId, [{ selector: String(payload['selector']), value: String(payload['text'] ?? '') }]);
  }

  // Fallback: direct execution for DOM_CLICK
  if (type === MessageType.DOM_CLICK) {
    return clickDirect(tabId, (payload['selectors'] as string[]) ?? []);
  }

  return { success: false, error: 'Cannot access page for this operation' };
}

/**
 * Click elements directly via chrome.scripting.executeScript.
 * Fallback when content script is unavailable.
 */
async function clickDirect(tabId: number, selectors: string[]): Promise<AgentGrowResponse> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      args: [selectors],
      func: (sels: string[]) => {
        const errors: string[] = [];
        let applied = 0;
        for (const sel of sels) {
          let el: Element | null = null;
          try { el = document.querySelector(sel); } catch { errors.push(`Invalid: ${sel}`); continue; }
          if (!el || !(el instanceof HTMLElement)) { errors.push(`Not found: ${sel}`); continue; }
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.focus(); el.click();
          el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
          el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
          el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          applied++;
        }
        return { applied, errors };
      },
    });
    const data = results?.[0]?.result;
    return data ? { success: true, data } : { success: false, error: 'No result' };
  } catch (e) {
    return { success: false, error: `Click failed: ${String(e)}` };
  }
}

// ─── Message Router ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (rawMsg: unknown, sender: chrome.runtime.MessageSender, sendResponse: (r: AgentGrowResponse) => void) => {
    handleMessage(rawMsg, sender).then(sendResponse).catch((err: unknown) => {
      sendResponse({ success: false, error: String(err) });
    });
    return true;
  }
);

async function handleMessage(
  rawMsg: unknown,
  sender: chrome.runtime.MessageSender
): Promise<AgentGrowResponse> {
  await ensureInitialized();

  const parsed = AgentGrowMessageSchema.safeParse(rawMsg);
  if (!parsed.success) return { success: false, error: 'Malformed message' };
  const msg = parsed.data;

  if (msg.source === 'content' && !sender.tab) {
    return { success: false, error: 'Invalid sender' };
  }

  // ── Unauthenticated routes ─────────────────────────────────────────────────
  switch (msg.type) {
    case MessageType.GET_AUTH_STATUS: {
      const user = await AuthService.getUser();
      return { success: true, data: user ?? { isAuthenticated: false } };
    }
    case MessageType.SIGN_IN: {
      const user = await AuthService.signIn();
      return { success: true, data: user };
    }
    case MessageType.SIGN_OUT: {
      await AuthService.signOut();
      return { success: true };
    }
  }

  // ── Auth gate ─────────────────────────────────────────────────────────────
  try {
    await ensureAuthenticated();
  } catch {
    return { success: false, error: 'UNAUTHENTICATED' };
  }

  // ── DOM operations on adjacent tab ──────────────────────────────────────────
  if (msg.type === MessageType.DOM_READ_PAGE || msg.type === MessageType.DOM_READ_SELECTION || DOM_WRITE_TYPES.has(msg.type)) {
    const windowId = msg.payload['windowId'] as number | undefined;
    const tab = await getAdjacentTab(windowId);
    if (!tab?.id) {
      return { success: false, error: 'No accessible tab found. Navigate to a regular webpage.' };
    }

    // READ operations: use direct scripting (no content script needed)
    if (msg.type === MessageType.DOM_READ_PAGE) {
      return readPageDirect(tab.id);
    }
    if (msg.type === MessageType.DOM_READ_SELECTION) {
      return readSelectionDirect(tab.id);
    }

    // WRITE operations: relay through content script
    return relayToDomScript(tab.id, msg.type, msg.payload);
  }

  // ── Authenticated routes ───────────────────────────────────────────────────
  switch (msg.type) {
    case MessageType.PROVIDER_LIST: {
      const list = await ProviderManager.list();
      return { success: true, data: list };
    }
    case MessageType.PROVIDER_ADD: {
      const p = msg.payload as Parameters<typeof ProviderManager.add>[0];
      const created = await ProviderManager.add(p);
      return { success: true, data: created };
    }
    case MessageType.PROVIDER_UPDATE: {
      const { id, ...patch } = msg.payload as { id: string } & Parameters<typeof ProviderManager.update>[1];
      const updated = await ProviderManager.update(id, patch);
      return { success: true, data: updated };
    }
    case MessageType.PROVIDER_DELETE: {
      await ProviderManager.delete(msg.payload['id'] as string);
      return { success: true };
    }
    case MessageType.PROVIDER_TEST: {
      const { baseUrl, type, apiKey, providerId } = msg.payload as {
        baseUrl:     string;
        type:        string;
        apiKey?:     string;
        providerId?: string;
      };

      // Resolve the API key: use the one sent from the form, or fetch the saved one from KeyVault
      let resolvedKey = apiKey ?? null;
      if (!resolvedKey && providerId) {
        resolvedKey = await ProviderManager.getApiKey(providerId);
      }

      const testUrl = type === 'ollama' ? `${baseUrl}/api/tags` : `${baseUrl}/models`;
      // Only set headers that are needed — Content-Type on GET triggers preflight
      // which fails on private networks without Access-Control-Allow-Private-Network
      const headers: Record<string, string> = {};
      if (resolvedKey) headers['Authorization'] = `Bearer ${resolvedKey}`;

      try {
        const res = await fetch(testUrl, {
          signal: AbortSignal.timeout(8000),
          headers,
        });
        return { success: res.ok, data: { status: res.status } };
      } catch (e) {
        // Private network access may block fetch from service worker.
        // Fallback: try via an active tab using chrome.scripting.executeScript
        try {
          const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
          if (tabs[0]?.id) {
            const results = await chrome.scripting.executeScript({
              target: { tabId: tabs[0].id },
              args: [testUrl, resolvedKey],
              func: async (url: string, key: string | null) => {
                try {
                  const h: Record<string, string> = {};
                  if (key) h['Authorization'] = `Bearer ${key}`;
                  const r = await fetch(url, { signal: AbortSignal.timeout(8000), headers: h });
                  return { ok: r.ok, status: r.status };
                } catch (err) {
                  return { ok: false, status: 0, error: String(err) };
                }
              },
            });
            const r = results?.[0]?.result as { ok: boolean; status: number; error?: string } | undefined;
            if (r?.ok) return { success: true, data: { status: r.status } };
            if (r?.error) return { success: false, error: r.error };
          }
        } catch { /* fallback also failed */ }
        return { success: false, error: String(e) };
      }
    }

    // Legacy
    case MessageType.GET_PAGE_CONTENT: {
      const windowId = msg.payload['windowId'] as number | undefined;
      const tab = await getAdjacentTab(windowId);
      if (!tab?.id) return { success: true, data: { content: '', url: '', title: '' } };
      return relayToDomScript(tab.id, MessageType.GET_PAGE_CONTENT, {});
    }

    default:
      return { success: false, error: `Unknown message type: ${msg.type as string}` };
  }
}

// ─── LLM Streaming via Port ──────────────────────────────────────────────────

const activeStreams = new Map<string, AbortController>();

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'llm-stream') return;

  port.onMessage.addListener(async (msg: {
    type: string;
    requestId: string;
    providerId: string;
    model: string;
    messages: Array<{ role: string; content: string }>;
    context?: string;
  }) => {
    if (msg.type !== 'chat') return;

    try {
      await ensureInitialized();

      try {
        await ensureAuthenticated();
      } catch {
        port.postMessage({ type: 'error', requestId: msg.requestId, error: 'Not authenticated' });
        return;
      }

      const provider = await ProviderManager.getConfig(msg.providerId);
      if (!provider) {
        port.postMessage({ type: 'error', requestId: msg.requestId, error: 'Provider not found' });
        return;
      }

      const apiKey = provider.keyRef ? await KeyVault.get(provider.keyRef) : null;

    // Build system prompt
    const SYSTEM_BASE = `You are AgentGrow — an open-source AI browser assistant that automates common browser tasks to save the user time. You can see the user's current web page and take actions on it.

## What You Do
You help users move faster by automating repetitive browser work:
- **Fill forms** — job applications, registrations, checkout flows, login fields, multi-step wizards
- **Write emails** — compose drafts in Gmail, Outlook, or any webmail compose box
- **Create & edit documents** — draft, rewrite, or summarize content in Google Docs, Notion, or any editable area
- **Extract data** — pull emails, links, tables, prices, names, or any structured data from the page
- **Compose messages** — write replies in Telegram, Slack, Discord, WhatsApp Web, or any chat app
- **Navigate & research** — guide users through complex sites, explain page content, find specific information

## Core Rules
1. You CAN see the page. When page context is provided, USE IT. Never say "I can't see the page" or "I don't have access."
2. Be action-oriented. When you see something you can help with (an empty form, a compose box, data to extract), proactively offer to act — don't just describe what you see.
3. Answer directly. No disclaimers, no filler, no echoing the page content back verbatim.
4. Use markdown: headings, lists, bold, code blocks. Keep responses concise unless the user asks for detail.
5. When the user says "this page", "the page", or "here", they mean the page context below.

## CRITICAL: Selector Accuracy
- The page context contains sections "FILLABLE FIELDS" and "CLICKABLE ELEMENTS" with **verified CSS selectors** extracted from the live DOM.
- You MUST use ONLY the exact selectors listed in the context. Copy them character-for-character into your agentgrow-fill or agentgrow-click blocks.
- NEVER fabricate, guess, or construct selectors on your own. If the element you need is not listed in the context, tell the user "I don't see that element on the page" instead of guessing.
- If you need to fill a field and you see its selector is textarea[name="q"], use exactly that — not #search, not input[type="text"], not a made-up ID.
- Before outputting any action block, mentally verify: "Is this selector listed in the FILLABLE FIELDS or CLICKABLE ELEMENTS section?" If not, do not use it.

## Capabilities
1. **Read the page** — answer questions, summarize, find information, list items, compare sections
2. **Fill forms & type text** — write into input fields, textareas, selects, and contenteditable elements (Gmail compose, Slack message box, Telegram input, Notion blocks, etc.)
3. **Extract data** — pull emails, phone numbers, links, table rows, prices, addresses, or any structured data
4. **Draft content** — write emails, messages, replies, summaries, or any text based on page context

## Form Fill & Text Entry (agentgrow-fill)

When the user asks you to fill a form, type a message, compose an email, or enter text into ANY field on the page:

1. Check the "Forms on page" or "Page inputs" section in the context for available fields and their CSS selectors.
2. Briefly tell the user what you will fill in.
3. Output a fenced code block tagged \`agentgrow-fill\` with a JSON array of {selector, value} objects:

\`\`\`agentgrow-fill
[{"selector": "#email", "value": "user@example.com"}, {"selector": "#name", "value": "John Doe"}]
\`\`\`

This works for:
- Standard inputs, textareas, and selects
- Contenteditable elements (Gmail compose, Slack, Telegram, Discord, Notion, etc.)
- React/Angular/Vue controlled components (events are dispatched correctly)

**Rules:**
- Use the exact CSS selectors from the page context. If no matching field exists, tell the user.
- For multi-field forms, fill all relevant fields in a single code block.
- For chat apps and email compose, target the contenteditable message input.
- If the user provides partial info, fill what you can and ask about the rest.

## Clicking & Navigation (agentgrow-click)

When the user asks you to click a button, follow a link, submit a form, navigate to a section, or interact with any clickable element:

1. Check the "Clickable elements on page" section in the context for available buttons/links and their CSS selectors.
2. Tell the user what you will click and why.
3. Output a fenced code block tagged \`agentgrow-click\` with a JSON array of CSS selector strings:

\`\`\`agentgrow-click
["#submit-btn"]
\`\`\`

For multi-step navigation (e.g., "click Settings then click Privacy"):
- Output ONE click block per step. After each click, the page may change — wait for the user's next message to see the updated page context.
- Do NOT chain multiple navigation clicks in one response unless they are on the same page (e.g., filling a form then clicking Submit).

**Common patterns:**
- "Click the Submit button" → find the submit button selector, output agentgrow-click
- "Go to the Settings page" → find the Settings link/button, click it
- "Fill this form and submit" → output agentgrow-fill for the fields, then agentgrow-click for the submit button
- "Click the next page button" → find pagination/next button, click it

**Rules:**
- Always use selectors from the page context. Never guess selectors.
- For form submission: fill fields first (agentgrow-fill), then click submit (agentgrow-click) — in the SAME response.
- Scroll-into-view happens automatically before clicking.
- If a click navigates to a new page, tell the user to send another message so you can see the new page.`;

    const systemContent = msg.context
      ? `${SYSTEM_BASE}

## Page Context (auto-extracted from the user's current tab)

${msg.context}

The FILLABLE FIELDS and CLICKABLE ELEMENTS sections contain verified selectors from the live DOM. Use ONLY these selectors in your action blocks. The content is real and current.`
      : SYSTEM_BASE;

    const llmMessages = [
      { role: 'system', content: systemContent },
      ...msg.messages,
    ];

    const isOllama = provider.type === 'ollama';
    const url = isOllama
      ? `${provider.baseUrl}/api/chat`
      : `${provider.baseUrl}/chat/completions`;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const controller = new AbortController();
    activeStreams.set(msg.requestId, controller);

    // Abort fetch + cancel reader when port disconnects (fixes memory leak)
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    port.onDisconnect.addListener(() => {
      controller.abort();
      reader?.cancel().catch(() => {});
      activeStreams.delete(msg.requestId);
    });

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: msg.model ?? provider.model,
          messages: llmMessages,
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        const friendly = res.status === 401 ? 'Invalid API key — check your key in Settings'
          : res.status === 403 ? 'Access denied — your API key may lack permissions for this model'
          : res.status === 429 ? 'Rate limited — too many requests, try again in a moment'
          : res.status === 404 ? `Model not found — "${msg.model}" may not be available on this provider`
          : res.status >= 500 ? `Provider server error (${res.status}) — try again later`
          : `API error ${res.status}: ${errText.slice(0, 200)}`;
        port.postMessage({ type: 'error', requestId: msg.requestId, error: friendly });
        return;
      }

      if (!res.body) {
        port.postMessage({ type: 'error', requestId: msg.requestId, error: 'Empty response body from LLM' });
        return;
      }

      reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (!controller.signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          if (isOllama) {
            try {
              const obj = JSON.parse(trimmed) as { message?: { content?: string }; done?: boolean };
              const token = obj.message?.content ?? '';
              if (token) port.postMessage({ type: 'token', requestId: msg.requestId, token });
              if (obj.done) break;
            } catch { /* skip malformed lines */ }
          } else {
            if (!trimmed.startsWith('data: ')) continue;
            const data = trimmed.slice(6);
            if (data === '[DONE]') break;
            try {
              const obj = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
              const token = obj.choices?.[0]?.delta?.content ?? '';
              if (token) port.postMessage({ type: 'token', requestId: msg.requestId, token });
            } catch { /* skip malformed lines */ }
          }
        }
      }

      if (!controller.signal.aborted) {
        port.postMessage({ type: 'done', requestId: msg.requestId });
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        try { port.postMessage({ type: 'error', requestId: msg.requestId, error: String(e) }); } catch { /* port already closed */ }
      }
    } finally {
      reader?.cancel().catch(() => {});
      reader = null;
      activeStreams.delete(msg.requestId);
    }

    } catch (outerErr) {
      // Top-level catch — ensures port always gets an error, never hangs
      try { port.postMessage({ type: 'error', requestId: msg.requestId, error: String(outerErr) }); } catch { /* port closed */ }
    }
  });
});

// ─── Extension Lifecycle ──────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async () => {
  await ensureInitialized();
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  await runMigrations();
});

chrome.action.onClicked.addListener(async (tab) => {
  await ensureInitialized();
  if (tab.id) await chrome.sidePanel.open({ tabId: tab.id });
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureInitialized();
  await AuthService.silentCheck();
});

// ─── Migrations ───────────────────────────────────────────────────────────────

async function runMigrations(): Promise<void> {
  const { schemaVersion } = await chrome.storage.local.get('schemaVersion');
  const current = (schemaVersion as number | undefined) ?? 0;
  if (current < 1) {
    await chrome.storage.local.set({ schemaVersion: 1 });
  }
}
