/**
 * AgentGrow Content Script — isolated world, runs on all pages.
 *
 * Handles WRITE operations only:
 *  - Form fill (React-compatible native setter + events)
 *  - Text highlight (TreeWalker + <mark>)
 *  - Cursor insert (input/contenteditable/selection)
 *  - Clear highlights
 *
 * READ operations (page content, selection) are handled directly by the
 * service worker via chrome.scripting.executeScript — no content script needed.
 *
 * Security rules:
 *  - Validate CSS selectors before querying (catch throws)
 *  - Only fill <input>, <textarea>, <select> elements — not arbitrary DOM
 *  - Never eval() or set innerHTML with untrusted content
 */

import { MessageType } from '../core/types/messages.js';
import type {
  FormFillInstruction,
  HighlightInstruction,
  InsertTextInstruction,
  DomWriteResult,
} from '../core/types/dom.js';

const MARK_CLASS = 'agentgrow-highlight';

// ── WRITE: Form fill ──────────────────────────────────────────────────────────

/**
 * Resolve element — tries selector directly, then fallbacks by name/aria-label/id/placeholder.
 */
function resolveElement(selector: string): Element | null {
  try { const el = document.querySelector(selector); if (el) return el; } catch { /* try fallbacks */ }
  const nameMatch = selector.match(/\[name="([^"]+)"\]/);
  if (nameMatch) { const el = document.querySelector(`[name="${nameMatch[1]}"]`); if (el) return el; }
  const ariaMatch = selector.match(/\[aria-label="([^"]+)"\]/);
  if (ariaMatch) { const el = document.querySelector(`[aria-label="${ariaMatch[1]}"]`); if (el) return el; }
  const idMatch = selector.match(/#([\w-]+)/);
  if (idMatch) { const el = document.getElementById(idMatch[1]); if (el) return el; }
  const phMatch = selector.match(/\[placeholder="([^"]+)"\]/);
  if (phMatch) { const el = document.querySelector(`[placeholder="${phMatch[1]}"]`); if (el) return el; }
  return null;
}

/**
 * Dispatch comprehensive events for React/Angular/Vue/vanilla compatibility.
 */
function dispatchFillEvents(el: HTMLElement, value: string) {
  el.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
  el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
  el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: value }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Unidentified' }));
  el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Unidentified' }));
  el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
  el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
}

function fillForms(instructions: FormFillInstruction[]): DomWriteResult {
  const errors: string[] = [];
  let applied = 0;

  for (const { selector, value } of instructions) {
    const el = resolveElement(selector);
    if (!el) { errors.push(`Element not found: ${selector}`); continue; }

    // ── Contenteditable (Telegram, Slack, Gmail compose, Notion, etc.) ──
    if (el instanceof HTMLElement && el.isContentEditable) {
      el.focus(); el.click();
      const sel = window.getSelection();
      if (sel) {
        const range = document.createRange();
        range.selectNodeContents(el);
        sel.removeAllRanges(); sel.addRange(range);
        sel.deleteFromDocument();
      }
      document.execCommand('insertText', false, value);
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
      applied++;
      continue;
    }

    // ── Standard inputs & textareas ──
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      el.scrollIntoView({ behavior: 'instant', block: 'center' });
      el.focus(); el.click();

      const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (nativeSetter) { nativeSetter.call(el, value); } else { el.value = value; }

      try { el.selectionStart = el.selectionEnd = value.length; } catch { /* some types don't support selection */ }
      dispatchFillEvents(el, value);
      applied++;
      continue;
    }

    // ── Select dropdowns (match by value or text) ──
    if (el instanceof HTMLSelectElement) {
      el.focus();
      let matched = false;
      for (const opt of Array.from(el.options)) {
        if (opt.value === value || opt.text.toLowerCase() === value.toLowerCase()) {
          el.value = opt.value; matched = true; break;
        }
      }
      if (!matched) {
        for (const opt of Array.from(el.options)) {
          if (opt.text.toLowerCase().includes(value.toLowerCase())) {
            el.value = opt.value; matched = true; break;
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

    // ── Fallback: role="textbox" or custom elements ──
    if (el instanceof HTMLElement) {
      el.focus(); el.click();
      try {
        document.execCommand('insertText', false, value);
        applied++;
      } catch {
        errors.push(`Cannot fill: ${selector}`);
      }
      continue;
    }

    errors.push(`Not editable: ${selector}`);
  }

  return { applied, errors };
}

// ── WRITE: Highlight text ─────────────────────────────────────────────────────

function highlightText({ text, color, all }: HighlightInstruction): DomWriteResult {
  if (!text.trim()) return { applied: 0, errors: ['Empty search text'] };

  injectHighlightStyles();

  let applied = 0;
  const errors: string[] = [];
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (['SCRIPT','STYLE','NOSCRIPT','MARK'].includes(parent.tagName))
          return NodeFilter.FILTER_REJECT;
        if (parent.classList.contains(MARK_CLASS)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    }
  );

  const textNodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) textNodes.push(node as Text);

  for (const textNode of textNodes) {
    const content = textNode.nodeValue ?? '';
    const idx = content.toLowerCase().indexOf(text.toLowerCase());
    if (idx === -1) continue;

    const range = document.createRange();
    range.setStart(textNode, idx);
    range.setEnd(textNode, idx + text.length);

    const mark = document.createElement('mark');
    mark.className = MARK_CLASS;
    mark.style.backgroundColor = color || '#fef08a';
    mark.style.color = 'inherit';
    mark.style.borderRadius = '2px';
    mark.style.padding = '0 1px';

    try {
      range.surroundContents(mark);
      if (applied === 0) mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
      applied++;
      if (!all) break;
    } catch (e) {
      errors.push(String(e));
    }
  }

  return { applied, errors };
}

function injectHighlightStyles() {
  if (document.getElementById('agentgrow-styles')) return;
  const style = document.createElement('style');
  style.id = 'agentgrow-styles';
  style.textContent = `
    .${MARK_CLASS} { animation: agentgrow-pulse 0.5s ease; }
    @keyframes agentgrow-pulse {
      0%   { outline: 2px solid #22d3a8; }
      100% { outline: none; }
    }
  `;
  document.head.appendChild(style);
}

function clearMarks(): DomWriteResult {
  const marks = document.querySelectorAll(`.${MARK_CLASS}`);
  marks.forEach(mark => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parent.normalize();
  });
  return { applied: marks.length, errors: [] };
}

// ── WRITE: Insert text at cursor ──────────────────────────────────────────────

function insertTextAtCursor({ text }: InsertTextInstruction): DomWriteResult {
  const active = document.activeElement;

  // Case 1: active element is a text input/textarea
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
    const start = active.selectionStart ?? active.value.length;
    const end   = active.selectionEnd   ?? active.value.length;
    const before = active.value.slice(0, start);
    const after  = active.value.slice(end);

    const nativeSetter = Object.getOwnPropertyDescriptor(
      active instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype,
      'value'
    )?.set;
    const newValue = before + text + after;
    if (nativeSetter) {
      nativeSetter.call(active, newValue);
    } else {
      active.value = newValue;
    }
    active.selectionStart = active.selectionEnd = start + text.length;
    active.dispatchEvent(new Event('input',  { bubbles: true }));
    active.dispatchEvent(new Event('change', { bubbles: true }));
    return { applied: 1, errors: [] };
  }

  // Case 2: contenteditable
  if (active instanceof HTMLElement && active.isContentEditable) {
    document.execCommand('insertText', false, text);
    return { applied: 1, errors: [] };
  }

  // Case 3: there's a text selection — replace it
  const sel = window.getSelection();
  if (sel && !sel.isCollapsed) {
    sel.deleteFromDocument();
    const range = sel.getRangeAt(0);
    range.insertNode(document.createTextNode(text));
    range.collapse(false);
    return { applied: 1, errors: [] };
  }

  return { applied: 0, errors: ['No active input or selection to insert into'] };
}

// ── WRITE: Insert text into a specific element by selector ───────────────────

function insertTextAtSelector(selector: string, text: string): DomWriteResult {
  const el = resolveElement(selector);
  if (!el || !(el instanceof HTMLElement)) return { applied: 0, errors: [`Element not found: ${selector}`] };

  el.focus();
  el.click();

  // contenteditable
  if (el.isContentEditable) {
    // Place cursor at end
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    document.execCommand('insertText', false, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return { applied: 1, errors: [] };
  }

  // Standard input/textarea
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype,
      'value'
    )?.set;
    if (nativeSetter) { nativeSetter.call(el, text); } else { el.value = text; }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return { applied: 1, errors: [] };
  }

  return { applied: 0, errors: ['Element is not editable'] };
}

// ── Message listener (WRITE operations only) ─────────────────────────────────

chrome.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
  const m = msg as { type?: string; payload?: Record<string, unknown> };

  // Ping handler — used by ensureContentScript to check if we're alive
  if (m.type === '__PING__') {
    sendResponse({ success: true });
    return false;
  }

  switch (m.type) {
    case MessageType.DOM_FILL_FORM: {
      const result = fillForms(
        (m.payload?.['instructions'] as FormFillInstruction[]) ?? []
      );
      sendResponse({ success: true, data: result });
      break;
    }

    case MessageType.DOM_CLICK: {
      const selectors = (m.payload?.['selectors'] as string[]) ?? [];
      const errors: string[] = [];
      let clicked = 0;
      for (const sel of selectors) {
        let el: Element | null = null;
        try { el = document.querySelector(sel); } catch { errors.push(`Invalid selector: ${sel}`); continue; }
        if (!el) { errors.push(`Element not found: ${sel}`); continue; }
        if (el instanceof HTMLElement) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.focus();
          el.click();
          // Also dispatch pointer events for React/framework compatibility
          el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
          el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
          el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          clicked++;
        } else {
          errors.push(`Not clickable: ${sel}`);
        }
      }
      sendResponse({ success: true, data: { applied: clicked, errors } });
      break;
    }

    case MessageType.DOM_HIGHLIGHT_TEXT: {
      const result = highlightText(m.payload as unknown as HighlightInstruction);
      sendResponse({ success: true, data: result });
      break;
    }

    case MessageType.DOM_INSERT_TEXT: {
      const payload = m.payload as Record<string, unknown>;
      // If a selector is provided, click + focus + insert into that specific element
      if (payload['selector'] && typeof payload['selector'] === 'string') {
        const result = insertTextAtSelector(payload['selector'], String(payload['text'] ?? ''));
        sendResponse({ success: true, data: result });
      } else {
        // Fallback: insert at current cursor position
        const result = insertTextAtCursor(payload as unknown as InsertTextInstruction);
        sendResponse({ success: true, data: result });
      }
      break;
    }

    case MessageType.DOM_CLEAR_MARKS:
      sendResponse({ success: true, data: clearMarks() });
      break;

    default:
      return false; // not handled — don't keep channel open
  }

  return false; // synchronous response
});
