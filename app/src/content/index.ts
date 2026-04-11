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

function fillForms(instructions: FormFillInstruction[]): DomWriteResult {
  const errors: string[] = [];
  let applied = 0;

  for (const { selector, value } of instructions) {
    let el: Element | null = null;
    try {
      el = document.querySelector(selector);
    } catch {
      errors.push(`Invalid selector: ${selector}`);
      continue;
    }
    if (!el) { errors.push(`Element not found: ${selector}`); continue; }

    // Handle contenteditable elements (Telegram, Slack, Gmail compose, etc.)
    if (el instanceof HTMLElement && el.isContentEditable) {
      el.focus();
      // Clear existing content and insert new text
      const sel = window.getSelection();
      if (sel) {
        sel.selectAllChildren(el);
        sel.deleteFromDocument();
      }
      document.execCommand('insertText', false, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      applied++;
      continue;
    }

    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) {
      errors.push(`Element is not a form field: ${selector}`);
      continue;
    }

    try {
      if (el instanceof HTMLSelectElement) {
        el.value = value;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        // React-compatible: use native setter to bypass synthetic event system
        const proto = el instanceof HTMLInputElement
          ? HTMLInputElement.prototype
          : HTMLTextAreaElement.prototype;
        const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (nativeSetter) {
          nativeSetter.call(el, value);
        } else {
          (el as HTMLInputElement).value = value;
        }
        el.dispatchEvent(new Event('input',  { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      el.focus();
      applied++;
    } catch (e) {
      errors.push(`Failed to fill ${selector}: ${String(e)}`);
    }
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

// ── Message listener (WRITE operations only) ─────────────────────────────────

chrome.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
  const m = msg as { type?: string; payload?: Record<string, unknown> };

  switch (m.type) {
    case MessageType.DOM_FILL_FORM: {
      const result = fillForms(
        (m.payload?.['instructions'] as FormFillInstruction[]) ?? []
      );
      sendResponse({ success: true, data: result });
      break;
    }

    case MessageType.DOM_HIGHLIGHT_TEXT: {
      const result = highlightText(m.payload as unknown as HighlightInstruction);
      sendResponse({ success: true, data: result });
      break;
    }

    case MessageType.DOM_INSERT_TEXT: {
      const result = insertTextAtCursor(m.payload as unknown as InsertTextInstruction);
      sendResponse({ success: true, data: result });
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
