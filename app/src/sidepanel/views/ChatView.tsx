import { useEffect, useState, useRef, useCallback } from 'react';
import { Settings, ChevronDown, Check, FileText, Loader2, Square, RotateCcw, Copy, CheckCheck, MessageSquarePlus, ShieldCheck, ShieldAlert, AlertTriangle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import type { PublicUserInfo } from '../../core/types/auth.js';
import type { ProviderConfigPublic } from '../../core/types/provider.js';
import { PROVIDER_PRESETS } from '../../core/types/provider.js';
import type { StructuredPageContent, SelectionContext } from '../../core/types/dom.js';
import { MessageType } from '../../core/types/messages.js';
import { z } from 'zod';
import { useProviderStore } from '../store/providerStore.js';
import { usePageContext } from '../hooks/usePageContext.js';
import { sendMessage } from '../utils/messaging.js';

interface ChatViewProps {
  user:       PublicUserInfo;
  onSignOut:  () => void;
  onSettings: () => void;
}

interface ChatMessage {
  id:        string;
  role:      'user' | 'assistant';
  content:   string;
  timestamp: number;
}

export function ChatView({ user, onSignOut, onSettings }: ChatViewProps) {
  const { providers, activeProviderId, activeModel, loading: providersLoading, load, setActive } = useProviderStore();
  const ctx = usePageContext();

  const [modelOpen, setModelOpen] = useState(false);
  const [input, setInput]         = useState('');
  const [messages, setMessages]   = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string>(() => crypto.randomUUID());
  const [isGenerating, setIsGenerating] = useState(false);

  // Action safety mode: 'ask' = confirm before page actions, 'auto' = act immediately
  const [actionMode, setActionMode] = useState<'ask' | 'auto'>('ask');
  const actionModeRef = useRef(actionMode);
  actionModeRef.current = actionMode;
  const [pendingActions, setPendingActions] = useState<string | null>(null);

  const dropdownRef  = useRef<HTMLDivElement>(null);
  const textareaRef  = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const portRef      = useRef<chrome.runtime.Port | null>(null);
  const requestIdRef = useRef<string | null>(null);

  useEffect(() => { void load(); }, [load]);

  // Restore action mode preference on mount
  useEffect(() => {
    chrome.storage.local.get('actionMode').then(stored => {
      const mode = stored['actionMode'] as 'ask' | 'auto' | undefined;
      if (mode) setActionMode(mode);
    }).catch(() => {});
  }, []);

  // Restore last conversation on mount
  useEffect(() => {
    chrome.storage.local.get('activeConversation').then(stored => {
      const conv = stored['activeConversation'] as { id: string; messages: ChatMessage[] } | undefined;
      if (conv?.messages?.length) {
        setConversationId(conv.id);
        setMessages(conv.messages);
      }
    }).catch(() => {});
  }, []);

  // Persist messages whenever they change (debounced)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (messages.length > 0) {
        chrome.storage.local.set({
          activeConversation: { id: conversationId, messages },
        }).catch(() => {});
      }
    }, 500);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [messages, conversationId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Close model dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (!dropdownRef.current?.contains(e.target as Node)) setModelOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Setup streaming Port
  const setupPort = useCallback(() => {
    if (portRef.current) return portRef.current;

    const port = chrome.runtime.connect({ name: 'llm-stream' });
    portRef.current = port;

    port.onMessage.addListener((msg: { type: string; requestId: string; token?: string; error?: string }) => {
      if (msg.requestId !== requestIdRef.current) return;

      if (msg.type === 'token' && msg.token) {
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant') {
            return [...prev.slice(0, -1), { ...last, content: last.content + msg.token }];
          }
          return prev;
        });
      } else if (msg.type === 'done') {
        setIsGenerating(false);
        requestIdRef.current = null;
        // Check for page actions in the response
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant') {
            const hasActions = /```agentgrow-(fill|click)\s*\n/g.test(last.content);
            if (hasActions) {
              // In 'auto' mode, execute immediately; in 'ask' mode, queue for confirmation
              if (actionModeRef.current === 'auto') {
                void executeActions(last.content);
              } else {
                setPendingActions(last.content);
              }
            }
          }
          return prev;
        });
      } else if (msg.type === 'error') {
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant' && !last.content) {
            return [...prev.slice(0, -1), { ...last, content: `Error: ${msg.error}` }];
          }
          return [...prev, { id: crypto.randomUUID(), role: 'assistant', content: `Error: ${msg.error}`, timestamp: Date.now() }];
        });
        setIsGenerating(false);
        requestIdRef.current = null;
      }
    });

    port.onDisconnect.addListener(() => {
      portRef.current = null;
      if (requestIdRef.current) {
        setIsGenerating(false);
        requestIdRef.current = null;
      }
    });

    return port;
  }, []);

  // Cleanup Port on unmount
  useEffect(() => {
    return () => { portRef.current?.disconnect(); };
  }, []);

  const activeProvider = providers.find(p => p.id === activeProviderId);
  const displayLabel = activeProvider
    ? `${activeProvider.name}  ›  ${activeModel ?? activeProvider.model}`
    : 'No provider';

  function toggleActionMode() {
    const next = actionMode === 'ask' ? 'auto' : 'ask';
    setActionMode(next);
    chrome.storage.local.set({ actionMode: next }).catch(() => {});
  }

  function approveActions() {
    if (pendingActions) {
      void executeActions(pendingActions);
      setPendingActions(null);
    }
  }

  function rejectActions() {
    setPendingActions(null);
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(), role: 'assistant',
      content: '> Action cancelled by user.',
      timestamp: Date.now(),
    }]);
  }

  function autoResize(el: HTMLTextAreaElement) {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || !activeProviderId || !activeModel || isGenerating) return;

    const reqId = crypto.randomUUID();
    requestIdRef.current = reqId;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput('');
    setIsGenerating(true);

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    // ── Build context: selection → full page (always auto-read) ──────────
    let context = '';
    const windowPayload = ctx.windowId ? { windowId: ctx.windowId } : {};

    try {
      // 1. Check for text selection on the page first
      const selRes = await sendMessage<SelectionContext | null>({
        type:    MessageType.DOM_READ_SELECTION,
        source:  'sidepanel',
        payload: windowPayload,
      });

      if (selRes.success && selRes.data?.text) {
        const { text: selText, before, after } = selRes.data;
        context = [
          '=== SELECTED TEXT FROM PAGE ===',
          before ? `…${before}` : '',
          `[SELECTION START]${selText}[SELECTION END]`,
          after  ? `${after}…`  : '',
          '=== END SELECTED TEXT ===',
        ].filter(Boolean).join('\n');
      }

      // 2. Always read the full page (for forms + headings + text if no selection)
      const pageRes = await sendMessage<StructuredPageContent>({
        type:    MessageType.DOM_READ_PAGE,
        source:  'sidepanel',
        payload: windowPayload,
      });

      if (pageRes.success && pageRes.data) {
        const p = pageRes.data;
        const pageParts = [
          `=== PAGE CONTEXT ===`,
          `URL: ${p.url}`,
          `Title: ${p.title}`,
        ];
        if (p.description) pageParts.push(`Description: ${p.description}`);

        // ── ACTIONABLE ELEMENTS (most important for the LLM) ──
        // Structured as a clear inventory so the LLM knows exactly what it can interact with

        // Form fields — each with a verified CSS selector
        const allFields: Array<{ label: string; selector: string; type: string; value: string; required: boolean; placeholder: string }> = [];
        if (p.forms.length) {
          p.forms.forEach(f => {
            f.fields.forEach(field => {
              allFields.push({
                label: field.label || field.name || field.placeholder || 'unnamed',
                selector: field.selector,
                type: field.type,
                value: field.currentValue || '',
                required: field.required,
                placeholder: field.placeholder || '',
              });
            });
          });
        }

        if (allFields.length) {
          pageParts.push('\n## FILLABLE FIELDS (use these exact selectors with agentgrow-fill)');
          allFields.forEach((f, i) => {
            const parts = [`${i + 1}. "${f.label}"`];
            parts.push(`→ selector: \`${f.selector}\``);
            parts.push(`(${f.type})`);
            if (f.value) parts.push(`[current: "${f.value.slice(0, 50)}"]`);
            if (f.required) parts.push('[required]');
            if (f.placeholder) parts.push(`[placeholder: "${f.placeholder}"]`);
            pageParts.push(parts.join(' '));
          });
        }

        // Clickable elements — each with a verified CSS selector
        const clickables = (p as unknown as Record<string, unknown>)['clickables'] as Array<{ text: string; selector: string; tag: string; href?: string }> | undefined;
        if (clickables?.length) {
          pageParts.push('\n## CLICKABLE ELEMENTS (use these exact selectors with agentgrow-click)');
          clickables.forEach((c, i) => {
            const parts = [`${i + 1}. "${c.text}"`];
            parts.push(`→ selector: \`${c.selector}\``);
            parts.push(`(${c.tag})`);
            if (c.href) parts.push(`[navigates to: ${c.href}]`);
            pageParts.push(parts.join(' '));
          });
        }

        if (!allFields.length && !clickables?.length) {
          pageParts.push('\n[No interactive elements detected on this page]');
        }

        // ── PAGE TEXT CONTENT (for answering questions) ──
        if (!context) {
          if (p.headings.length) {
            pageParts.push('\n## PAGE STRUCTURE');
            p.headings.forEach(h => pageParts.push(`${'#'.repeat(h.level)} ${h.text}`));
          }
          pageParts.push('\n## PAGE TEXT CONTENT', p.mainText);
        }

        pageParts.push('\n=== END PAGE CONTEXT ===');

        // If we had selection context, append page context after it
        context = context
          ? context + '\n\n' + pageParts.join('\n')
          : pageParts.join('\n');
      }
    } catch {
      // Non-fatal — send without context
    }

    const chatHistory = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));

    const port = setupPort();
    port.postMessage({
      type:       'chat',
      requestId:  reqId,
      providerId: activeProviderId,
      model:      activeModel,
      messages:   chatHistory,
      context:    context || undefined,
      windowId:   ctx.windowId ?? undefined,
    });
  }

  /** Parse and execute agentgrow-fill and agentgrow-click code blocks */
  async function executeActions(content: string) {
    // ── Form fills ──
    const fillRegex = /```agentgrow-fill\s*\n([\s\S]*?)```/g;
    let match;
    while ((match = fillRegex.exec(content)) !== null) {
      try {
        const FillSchema = z.array(z.object({
          selector: z.string().min(1).max(500),
          value:    z.string().max(10_000),
        })).min(1).max(50);
        const instructions = FillSchema.parse(JSON.parse(match[1]));

        const res = await sendMessage<{ applied: number; errors: string[] }>({
          type:    MessageType.DOM_FILL_FORM,
          source:  'sidepanel',
          payload: { windowId: ctx.windowId, instructions },
        });

        let applied = res.data?.applied ?? 0;
        const errors = res.data?.errors ?? [];

        if (errors.length > 0) {
          for (const instr of instructions) {
            if (errors.some(e => e.includes(instr.selector))) {
              const insertRes = await sendMessage<{ applied: number; errors: string[] }>({
                type:    MessageType.DOM_INSERT_TEXT,
                source:  'sidepanel',
                payload: { windowId: ctx.windowId, text: instr.value, selector: instr.selector },
              });
              if (insertRes.success && insertRes.data?.applied) applied++;
            }
          }
        }

        const status = applied > 0
          ? `✓ Filled ${applied} field(s) on the page`
          : `✗ Could not fill: ${errors.join(', ')}`;
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(), role: 'assistant',
          content: applied > 0 ? `> ${status}` : `> **${status}**`,
          timestamp: Date.now(),
        }]);
      } catch { /* skip malformed */ }
    }

    // ── Click actions ──
    const clickRegex = /```agentgrow-click\s*\n([\s\S]*?)```/g;
    while ((match = clickRegex.exec(content)) !== null) {
      try {
        const ClickSchema = z.array(z.string().min(1).max(500)).min(1).max(10);
        const selectors = ClickSchema.parse(JSON.parse(match[1]));

        const res = await sendMessage<{ applied: number; errors: string[] }>({
          type:    MessageType.DOM_CLICK,
          source:  'sidepanel',
          payload: { windowId: ctx.windowId, selectors },
        });

        const clicked = res.data?.applied ?? 0;
        const errors = res.data?.errors ?? [];
        const status = clicked > 0
          ? `✓ Clicked ${clicked} element(s)`
          : `✗ Could not click: ${errors.join(', ')}`;
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(), role: 'assistant',
          content: clicked > 0 ? `> ${status}` : `> **${status}**`,
          timestamp: Date.now(),
        }]);
      } catch { /* skip malformed */ }
    }
  }

  function handleStop() {
    portRef.current?.disconnect();
    portRef.current = null;
    setIsGenerating(false);
    requestIdRef.current = null;
  }

  function handleRetry() {
    // Find the last user message and resend it
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUserMsg || isGenerating) return;
    // Remove the error message(s) after the last user message
    const lastUserIdx = messages.lastIndexOf(lastUserMsg);
    setMessages(messages.slice(0, lastUserIdx));
    setInput(lastUserMsg.content);
    // Auto-send on next tick
    setTimeout(() => { void handleSend(); }, 50);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="flex items-center gap-2 px-3 py-2.5 border-b border-ag-border bg-ag-surface shrink-0">
        {/* Settings gear */}
        <button
          onClick={onSettings}
          title="Settings"
          className="text-ag-sub hover:text-ag-text transition-colors p-1.5 rounded hover:bg-ag-muted shrink-0"
        >
          <Settings size={15} />
        </button>

        {/* New chat */}
        {messages.length > 0 && (
          <button
            onClick={() => {
              setMessages([]); setIsGenerating(false); handleStop();
              setConversationId(crypto.randomUUID());
              chrome.storage.local.remove('activeConversation').catch(() => {});
            }}
            title="New chat"
            className="text-ag-sub hover:text-ag-accent transition-colors p-1.5 rounded hover:bg-ag-muted shrink-0"
          >
            <MessageSquarePlus size={15} />
          </button>
        )}

        {/* Logo */}
        <div className="flex items-center gap-1.5 shrink-0">
          <img
            src="/public/icons/icon32.png"
            alt=""
            className="w-5 h-5 rounded"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <span className="text-xs font-semibold text-ag-text font-ui">AgentGrow</span>
        </div>

        <div className="flex-1" />

        {/* Model picker */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => providers.length > 0 ? setModelOpen(o => !o) : onSettings()}
            className={`flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1.5 rounded-lg border
              transition-colors max-w-[160px]
              ${providers.length === 0
                ? 'border-ag-warn/40 bg-ag-warn/10 text-ag-warn'
                : 'border-ag-border bg-ag-bg text-ag-sub hover:border-ag-muted hover:text-ag-text'
              }`}
          >
            <span className="truncate">{displayLabel}</span>
            {providers.length > 0 && <ChevronDown size={11} className="shrink-0" />}
          </button>

          {modelOpen && providers.length > 0 && (
            <ModelDropdown
              providers={providers}
              activeProviderId={activeProviderId}
              activeModel={activeModel}
              onSelect={(pid, model) => { setActive(pid, model); setModelOpen(false); }}
              onManage={() => { setModelOpen(false); onSettings(); }}
            />
          )}
        </div>

        {/* Avatar */}
        <img
          src={user.picture}
          alt={user.name}
          referrerPolicy="no-referrer"
          className="w-6 h-6 rounded-full border border-ag-border shrink-0 cursor-pointer"
          title={`${user.email} — click to sign out`}
          onClick={onSignOut}
        />
      </header>

      {/* ── Chat area ──────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {providersLoading && providers.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-6 h-6 border-2 border-ag-muted border-t-ag-accent rounded-full animate-spin" />
          </div>
        ) : providers.length === 0 ? (
          <EmptyState onSetup={onSettings} />
        ) : messages.length === 0 ? (
          <div className="text-center py-10 text-ag-sub text-sm space-y-1">
            <p className="text-ag-text font-medium">Hello, {user.name.split(' ')[0]}!</p>
            <p className="text-xs">Ask anything about the page, or start a conversation.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map(msg => (
              <MessageBubble
                key={msg.id}
                message={msg}
                isGenerating={isGenerating && msg === messages[messages.length - 1] && msg.role === 'assistant'}
                onRetry={msg.content.startsWith('Error:') ? handleRetry : undefined}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* ── Pending action confirmation (Ask before acting mode) ────────── */}
      {pendingActions && (
        <div className="px-3 py-2 bg-ag-warn/10 border-t border-ag-warn/30 shrink-0">
          <div className="flex items-center gap-2 text-xs">
            <ShieldCheck size={14} className="text-ag-warn shrink-0" />
            <span className="flex-1 text-ag-text font-medium">AgentGrow wants to act on the page</span>
          </div>
          <p className="text-[10px] text-ag-sub mt-1 mb-2">
            Review the action above, then approve or cancel.
          </p>
          <div className="flex gap-2">
            <button
              onClick={approveActions}
              className="flex-1 bg-ag-accent text-ag-bg text-xs font-semibold py-1.5 rounded-lg hover:bg-ag-success transition-colors"
            >
              Approve & Execute
            </button>
            <button
              onClick={rejectActions}
              className="flex-1 bg-ag-muted text-ag-text text-xs font-semibold py-1.5 rounded-lg hover:bg-ag-border transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Risk warning (Act without asking mode) ─────────────────────── */}
      {actionMode === 'auto' && !pendingActions && (
        <div className="px-3 py-1.5 bg-ag-error/8 border-t border-ag-error/20 shrink-0 flex items-center gap-2">
          <AlertTriangle size={11} className="text-ag-error shrink-0" />
          <span className="text-[10px] text-ag-error/80 flex-1">
            Auto-acting enabled — AgentGrow will click and type on pages without asking
          </span>
          <button
            onClick={toggleActionMode}
            className="text-[10px] text-ag-error underline shrink-0 hover:text-ag-text"
          >
            Switch to safe mode
          </button>
        </div>
      )}

      {/* ── Input area ─────────────────────────────────────────────────────── */}
      <div className="px-3 py-3 border-t border-ag-border bg-ag-surface shrink-0">
        <div className="flex items-end gap-2 bg-ag-bg rounded-xl border border-ag-border px-3 py-2
                        focus-within:border-ag-accent/50 transition-colors">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => { setInput(e.target.value); autoResize(e.target); }}
            onKeyDown={handleKeyDown}
            placeholder={providers.length === 0 ? 'Add a provider in Settings to start…' : 'Ask anything…'}
            disabled={providers.length === 0}
            rows={1}
            className="flex-1 bg-transparent text-ag-text text-sm resize-none outline-none
                       placeholder:text-ag-sub min-h-[24px] max-h-[120px] font-body disabled:opacity-40"
          />
          {isGenerating ? (
            <button
              onClick={handleStop}
              className="text-ag-error hover:text-ag-error/80 transition-colors shrink-0 pb-0.5"
              title="Stop generating"
            >
              <Square size={14} fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={providers.length === 0 || !input.trim()}
              className="text-ag-accent hover:text-ag-success transition-colors shrink-0 pb-0.5
                         disabled:opacity-30"
              title="Send (Enter)"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>
          )}
        </div>

        {/* Action mode + context indicator */}
        <div className="flex items-center gap-1.5 mt-1.5 px-1">
          <FileText size={10} className="text-ag-accent shrink-0" />
          <span className="text-[10px] text-ag-sub truncate flex-1">
            Page context auto-included
          </span>
          <button
            onClick={toggleActionMode}
            title={actionMode === 'ask' ? 'Ask before acting (safe) — click to change' : 'Act without asking — click to change'}
            className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border transition-all
              ${actionMode === 'ask'
                ? 'border-ag-accent/30 text-ag-accent bg-ag-accent/5'
                : 'border-ag-error/30 text-ag-error bg-ag-error/5'
              }`}
          >
            {actionMode === 'ask'
              ? <><ShieldCheck size={9} /> Ask first</>
              : <><ShieldAlert size={9} /> Auto-act</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Message bubble ──────────────────────────────────────────────────────────

function MessageBubble({ message, isGenerating, onRetry }: {
  message: ChatMessage;
  isGenerating: boolean;
  onRetry?: () => void;
}) {
  const isUser = message.role === 'user';
  const isError = !isUser && message.content.startsWith('Error:');
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    void navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function timeAgo(ts: number): string {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    return `${Math.floor(s / 3600)}h ago`;
  }

  return (
    <div className={`group flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[88%]">
        <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed
          ${isUser
            ? 'bg-ag-accent/15 text-ag-text rounded-br-md'
            : isError
              ? 'bg-ag-error/10 border border-ag-error/30 text-ag-text rounded-bl-md'
              : 'bg-ag-surface border border-ag-border text-ag-text rounded-bl-md'
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : message.content ? (
            <div className="prose-ag">
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                {message.content}
              </ReactMarkdown>
            </div>
          ) : isGenerating ? (
            <div className="flex items-center gap-1.5 text-ag-sub py-0.5">
              <Loader2 size={12} className="animate-spin" />
              <span className="text-xs">Thinking…</span>
            </div>
          ) : null}
        </div>

        {/* Actions row — visible on hover */}
        <div className="flex items-center gap-2 mt-0.5 px-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-[10px] text-ag-sub">{timeAgo(message.timestamp)}</span>
          {!isUser && message.content && (
            <button onClick={handleCopy} title="Copy" className="text-ag-sub hover:text-ag-text transition-colors">
              {copied ? <CheckCheck size={11} className="text-ag-success" /> : <Copy size={11} />}
            </button>
          )}
          {isError && onRetry && (
            <button onClick={onRetry} title="Retry" className="text-ag-sub hover:text-ag-accent transition-colors flex items-center gap-0.5 text-[10px]">
              <RotateCcw size={10} /> Retry
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Model dropdown ────────────────────────────────────────────────────────────

interface ModelDropdownProps {
  providers:        ProviderConfigPublic[];
  activeProviderId: string | null;
  activeModel:      string | null;
  onSelect:         (providerId: string, model: string) => void;
  onManage:         () => void;
}

function ModelDropdown({ providers, activeProviderId, activeModel, onSelect, onManage }: ModelDropdownProps) {
  const [cache, setCache] = useState<Record<string, string[]>>({});

  useEffect(() => {
    const keys = providers.map(p => `modelsCache:${p.baseUrl}`);
    if (keys.length === 0) return;
    chrome.storage.local.get(keys).then(store => {
      const next: Record<string, string[]> = {};
      for (const p of providers) {
        const entry = store[`modelsCache:${p.baseUrl}`] as { models?: string[] } | undefined;
        if (entry?.models) next[p.baseUrl] = entry.models;
      }
      setCache(next);
    }).catch(() => {});
  }, [providers]);

  // Build model lists: preset + cached fetched + configured model
  function getModels(p: ProviderConfigPublic): string[] {
    const preset = PROVIDER_PRESETS.find(pr => p.baseUrl.startsWith(pr.baseUrl) && pr.id !== 'custom');
    const presetModels = preset?.models ?? [];
    const cached = cache[p.baseUrl] ?? [];
    const all = [p.model, ...presetModels, ...cached];
    return [...new Set(all)];
  }

  return (
    <div className="absolute right-0 top-full mt-1.5 w-64 bg-ag-surface border border-ag-border
                    rounded-xl shadow-2xl z-50 overflow-hidden">
      <div className="max-h-80 overflow-y-auto">
        {providers.map(p => {
          const models = getModels(p);
          return (
            <div key={p.id}>
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest
                              text-ag-sub bg-ag-bg/50 sticky top-0 flex items-center justify-between">
                <span>{p.name}</span>
                <span className="text-ag-muted normal-case tracking-normal">{models.length} models</span>
              </div>
              {models.map(model => (
                <button
                  key={`${p.id}-${model}`}
                  onClick={() => onSelect(p.id, model)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-ag-text
                             hover:bg-ag-muted transition-colors text-left"
                >
                  {p.id === activeProviderId && model === activeModel
                    ? <Check size={12} className="text-ag-accent shrink-0" />
                    : <div className="w-3 shrink-0" />
                  }
                  <span className="font-mono truncate">{model}</span>
                </button>
              ))}
            </div>
          );
        })}
      </div>
      <div className="border-t border-ag-border px-3 py-2">
        <button
          onClick={onManage}
          className="text-xs text-ag-sub hover:text-ag-accent transition-colors"
        >
          Manage providers →
        </button>
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ onSetup }: { onSetup: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-6">
      <div className="w-12 h-12 rounded-2xl bg-ag-surface border border-ag-border
                      flex items-center justify-center">
        <Settings size={20} className="text-ag-sub" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-ag-text">No LLM provider yet</p>
        <p className="text-xs text-ag-sub leading-relaxed">
          Add OpenRouter, OpenAI, Anthropic, Groq,<br />Ollama, or any OpenAI-compatible endpoint.
        </p>
      </div>
      <button
        onClick={onSetup}
        className="bg-ag-accent text-ag-bg font-semibold text-sm px-5 py-2.5 rounded-lg
                   hover:bg-ag-success transition-colors"
      >
        Add a provider
      </button>
    </div>
  );
}
