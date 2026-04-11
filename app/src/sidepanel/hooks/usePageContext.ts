import { useState, useCallback, useEffect, useRef } from 'react';
import { MessageType } from '../../core/types/messages.js';
import type { StructuredPageContent, SelectionContext } from '../../core/types/dom.js';
import { sendMessage } from '../utils/messaging.js';

export type ContextMode = 'off' | 'page' | 'selection';

export interface PageContextState {
  mode:       ContextMode;
  page:       StructuredPageContent | null;
  selection:  SelectionContext | null;
  loading:    boolean;
  error:      string | null;
  windowId:   number | null;
}

export function usePageContext() {
  const [state, setState] = useState<PageContextState>({
    mode:      'off',
    page:      null,
    selection: null,
    loading:   false,
    error:     null,
    windowId:  null,
  });

  // Capture the windowId once on mount
  useEffect(() => {
    chrome.windows.getCurrent(w => {
      setState(s => ({ ...s, windowId: w.id ?? null }));
    });
  }, []);

  const readPage = useCallback(async (windowId: number | null) => {
    setState(s => ({ ...s, loading: true, error: null }));
    const res = await sendMessage<StructuredPageContent>({
      type:    MessageType.DOM_READ_PAGE,
      source:  'sidepanel',
      payload: windowId ? { windowId } : {},
    });
    if (res.success && res.data) {
      setState(s => ({ ...s, page: res.data!, loading: false }));
    } else {
      setState(s => ({ ...s, error: res.error ?? 'Failed to read page', loading: false }));
    }
  }, []);

  const readSelection = useCallback(async (windowId: number | null) => {
    const res = await sendMessage<SelectionContext | null>({
      type:    MessageType.DOM_READ_SELECTION,
      source:  'sidepanel',
      payload: windowId ? { windowId } : {},
    });
    if (res.success) {
      setState(s => ({ ...s, selection: res.data ?? null }));
    }
  }, []);

  const windowIdRef = useRef(state.windowId);
  windowIdRef.current = state.windowId;

  const toggleMode = useCallback(async (next: ContextMode) => {
    setState(s => ({ ...s, mode: next, error: null }));
    const wid = windowIdRef.current;
    if (next === 'page')      await readPage(wid);
    if (next === 'selection') await readSelection(wid);
  }, [readPage, readSelection]);

  // Poll selection when in selection mode (user might select different text)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    // Always clear previous interval first to avoid leaks
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    if (state.mode === 'selection') {
      pollingRef.current = setInterval(() => void readSelection(state.windowId), 1500);
    }
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [state.mode, state.windowId, readSelection]);

  /** Build a context string to prepend to LLM prompts */
  function buildContextString(): string {
    if (state.mode === 'off') return '';

    if (state.mode === 'selection' && state.selection?.text) {
      const { text, before, after } = state.selection;
      return [
        '=== SELECTED TEXT FROM PAGE ===',
        before ? `…${before}` : '',
        `[SELECTION START]${text}[SELECTION END]`,
        after  ? `${after}…`  : '',
        '=== END SELECTED TEXT ===',
      ].filter(Boolean).join('\n');
    }

    if (state.mode === 'page' && state.page) {
      const p = state.page;
      const parts = [
        `=== PAGE CONTEXT ===`,
        `URL: ${p.url}`,
        `Title: ${p.title}`,
      ];
      if (p.description) parts.push(`Description: ${p.description}`);
      if (p.headings.length) {
        parts.push('\nHeadings:');
        p.headings.forEach(h => parts.push(`${'#'.repeat(h.level)} ${h.text}`));
      }
      if (p.forms.length) {
        parts.push('\nForms detected:');
        p.forms.forEach(f => {
          parts.push(`  ${f.name}: ${f.fields.map(field => field.label || field.name).join(', ')}`);
        });
      }
      parts.push('\nContent:', p.mainText);
      parts.push('=== END PAGE CONTEXT ===');
      return parts.join('\n');
    }

    return '';
  }

  /** Actions the chat can invoke */
  async function fillForm(instructions: Array<{ selector: string; value: string }>) {
    return sendMessage({
      type:    MessageType.DOM_FILL_FORM,
      source:  'sidepanel',
      payload: { windowId: state.windowId, instructions },
    });
  }

  async function highlight(text: string, color = '#fef08a', all = true) {
    return sendMessage({
      type:    MessageType.DOM_HIGHLIGHT_TEXT,
      source:  'sidepanel',
      payload: { windowId: state.windowId, text, color, all },
    });
  }

  async function insertText(text: string) {
    return sendMessage({
      type:    MessageType.DOM_INSERT_TEXT,
      source:  'sidepanel',
      payload: { windowId: state.windowId, text },
    });
  }

  async function clearHighlights() {
    return sendMessage({
      type:    MessageType.DOM_CLEAR_MARKS,
      source:  'sidepanel',
      payload: { windowId: state.windowId },
    });
  }

  return { ...state, toggleMode, buildContextString, fillForm, highlight, insertText, clearHighlights };
}
