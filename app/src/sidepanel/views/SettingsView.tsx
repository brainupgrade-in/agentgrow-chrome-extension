import { useEffect, useState } from 'react';
import { ChevronRight, Plus, Trash2, Star, ArrowLeft, ExternalLink, CheckCircle2 } from 'lucide-react';
import { useProviderStore } from '../store/providerStore.js';
import type { ProviderConfigPublic } from '../../core/types/provider.js';

interface SettingsViewProps {
  onBack:      () => void;
  onAddProvider:  () => void;
  onEditProvider: (p: ProviderConfigPublic) => void;
}

export function SettingsView({ onBack, onAddProvider, onEditProvider }: SettingsViewProps) {
  const { providers, loading, load, remove, update } = useProviderStore();
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => { void load(); }, [load]);

  async function handleDelete(id: string) {
    setDeleting(id);
    await remove(id);
    setDeleting(null);
  }

  async function handleSetDefault(id: string) {
    await update(id, { isDefault: true });
    await load();
  }

  return (
    <div className="flex flex-col h-full bg-ag-bg">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 border-b border-ag-border bg-ag-surface shrink-0">
        <button
          onClick={onBack}
          className="text-ag-sub hover:text-ag-text transition-colors p-1 -ml-1 rounded hover:bg-ag-muted"
        >
          <ArrowLeft size={16} />
        </button>
        <h2 className="text-sm font-semibold text-ag-text">Settings</h2>
      </header>

      <div className="flex-1 overflow-y-auto">
        {/* Providers section */}
        <section className="px-4 pt-5 pb-2">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-widest text-ag-sub">
              LLM Providers
            </span>
            <button
              onClick={onAddProvider}
              className="flex items-center gap-1.5 text-xs font-medium text-ag-accent hover:text-ag-success transition-colors"
            >
              <Plus size={13} />
              Add provider
            </button>
          </div>

          {loading && providers.length === 0 && (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 border-2 border-ag-muted border-t-ag-accent rounded-full animate-spin" />
            </div>
          )}

          {!loading && providers.length === 0 && (
            <div className="text-center py-8 space-y-3">
              <p className="text-ag-sub text-sm">No providers configured yet.</p>
              <button
                onClick={onAddProvider}
                className="inline-flex items-center gap-2 bg-ag-accent text-ag-bg text-xs font-semibold px-4 py-2 rounded-lg hover:bg-ag-success transition-colors"
              >
                <Plus size={13} />
                Add your first provider
              </button>
            </div>
          )}

          <div className="space-y-2">
            {providers.map(p => (
              <ProviderRow
                key={p.id}
                provider={p}
                deleting={deleting === p.id}
                onEdit={() => onEditProvider(p)}
                onDelete={() => void handleDelete(p.id)}
                onSetDefault={() => void handleSetDefault(p.id)}
              />
            ))}
          </div>
        </section>

        {/* About section */}
        <section className="px-4 pt-6 pb-6">
          <div className="text-xs font-semibold uppercase tracking-widest text-ag-sub mb-3">About</div>
          <div className="bg-ag-surface border border-ag-border rounded-lg divide-y divide-ag-border text-sm">
            <a
              href="https://github.com/brainupgrade-in/agentgrow-chrome-extension"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between px-4 py-3 text-ag-text hover:bg-ag-muted transition-colors"
            >
              <span>GitHub</span>
              <ExternalLink size={13} className="text-ag-sub" />
            </a>
            <a
              href="https://devops.gheware.com/agentgrow/privacy/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between px-4 py-3 text-ag-text hover:bg-ag-muted transition-colors"
            >
              <span>Privacy Policy</span>
              <ExternalLink size={13} className="text-ag-sub" />
            </a>
            <a
              href="https://devops.gheware.com/agentgrow/terms/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between px-4 py-3 text-ag-text hover:bg-ag-muted transition-colors"
            >
              <span>Terms of Service</span>
              <ExternalLink size={13} className="text-ag-sub" />
            </a>
            <div className="flex items-center justify-between px-4 py-3 text-ag-sub">
              <span>Version</span>
              <span className="font-mono text-xs">0.1.0</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

interface ProviderRowProps {
  provider:   ProviderConfigPublic;
  deleting:   boolean;
  onEdit:     () => void;
  onDelete:   () => void;
  onSetDefault: () => void;
}

function ProviderRow({ provider, deleting, onEdit, onDelete, onSetDefault }: ProviderRowProps) {
  const host = (() => {
    try { return new URL(provider.baseUrl).hostname; }
    catch { return provider.baseUrl; }
  })();

  return (
    <div className="bg-ag-surface border border-ag-border rounded-lg overflow-hidden">
      <button
        onClick={onEdit}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-ag-muted transition-colors text-left"
      >
        {/* Default badge */}
        <div className="shrink-0">
          {provider.isDefault
            ? <CheckCircle2 size={15} className="text-ag-accent" />
            : <div className="w-[15px] h-[15px] rounded-full border border-ag-muted" />
          }
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-ag-text truncate">{provider.name}</span>
            {provider.hasApiKey && (
              <span className="text-[10px] font-medium bg-ag-accent/15 text-ag-accent px-1.5 py-0.5 rounded">
                key set
              </span>
            )}
          </div>
          <div className="text-xs text-ag-sub mt-0.5 font-mono truncate">
            {host} · {provider.model}
          </div>
        </div>

        <ChevronRight size={14} className="text-ag-sub shrink-0" />
      </button>

      {/* Actions row */}
      <div className="flex items-center gap-1 px-4 pb-2.5 pt-0">
        {!provider.isDefault && (
          <button
            onClick={onSetDefault}
            className="flex items-center gap-1 text-[11px] text-ag-sub hover:text-ag-accent transition-colors px-2 py-1 rounded hover:bg-ag-muted"
          >
            <Star size={11} />
            Set default
          </button>
        )}
        <div className="flex-1" />
        <button
          onClick={onDelete}
          disabled={deleting}
          className="flex items-center gap-1 text-[11px] text-ag-sub hover:text-ag-error transition-colors px-2 py-1 rounded hover:bg-ag-error/10 disabled:opacity-50"
        >
          <Trash2 size={11} />
          {deleting ? 'Removing…' : 'Remove'}
        </button>
      </div>
    </div>
  );
}
