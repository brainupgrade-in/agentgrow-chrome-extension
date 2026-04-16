import { useState, useEffect } from 'react';
import { ArrowLeft, Eye, EyeOff, ExternalLink, Loader2 } from 'lucide-react';
import { PROVIDER_PRESETS } from '../../core/types/provider.js';
import type { ProviderPreset, ProviderConfigPublic } from '../../core/types/provider.js';
import { useProviderStore } from '../store/providerStore.js';
import { sendMessage } from '../utils/messaging.js';
import { MessageType } from '../../core/types/messages.js';
import { isAllowedProviderUrl } from '../../core/utils/url.js';

interface ProviderFormViewProps {
  editing?: ProviderConfigPublic;   // undefined = add mode
  onBack:  () => void;
  onSaved: () => void;
}

interface FormState {
  presetId:  string;
  name:      string;
  baseUrl:   string;
  model:     string;
  apiKey:    string;
  isDefault: boolean;
}

export function ProviderFormView({ editing, onBack, onSaved }: ProviderFormViewProps) {
  const { add, update } = useProviderStore();
  const isEdit = !!editing;

  // Initial preset — try to match editing provider by URL
  const matchedPreset = editing
    ? PROVIDER_PRESETS.find(p => editing.baseUrl.startsWith(p.baseUrl) && p.id !== 'custom')
    : null;

  const [form, setForm] = useState<FormState>({
    presetId:  matchedPreset?.id ?? (isEdit ? 'custom' : 'openrouter'),
    name:      editing?.name    ?? '',
    baseUrl:   editing?.baseUrl ?? PROVIDER_PRESETS[0].baseUrl,
    model:     editing?.model   ?? PROVIDER_PRESETS[0].defaultModel,
    apiKey:    '',
    isDefault: editing?.isDefault ?? false,
  });

  const [showKey,   setShowKey]   = useState(false);
  const [testing,   setTesting]   = useState(false);
  const [testResult, setTestResult] = useState<'ok' | 'fail' | 'saved' | null>(null);
  const [saving,    setSaving]    = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [errors,    setErrors]    = useState<Partial<FormState>>({});
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [fetchModelsError, setFetchModelsError] = useState<string | null>(null);

  const preset: ProviderPreset | undefined = PROVIDER_PRESETS.find(p => p.id === form.presetId);

  // When preset changes, auto-fill name + URL + default model
  useEffect(() => {
    if (!preset || form.presetId === 'custom') return;
    setForm(f => ({
      ...f,
      name:    preset.name,
      baseUrl: preset.baseUrl,
      model:   preset.defaultModel,
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.presetId]);

  function set<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm(f => ({ ...f, [key]: val }));
    setErrors(e => ({ ...e, [key]: undefined }));
    setTestResult(null);
  }

  function validate(): boolean {
    const errs: Partial<FormState> = {};
    if (!form.name.trim()) errs.name = 'Required';
    if (!form.baseUrl.trim()) errs.baseUrl = 'Required';
    else if (!isAllowedProviderUrl(form.baseUrl)) errs.baseUrl = 'Must be HTTPS or localhost';
    if (!form.model.trim()) errs.model = 'Required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  // Load cached models for this baseUrl (instant dropdown on re-open)
  useEffect(() => {
    if (!form.baseUrl) { setFetchedModels([]); return; }
    const key = `modelsCache:${form.baseUrl}`;
    chrome.storage.local.get(key).then(store => {
      const entry = store[key] as { models?: string[] } | undefined;
      if (entry?.models && entry.models.length > 0) setFetchedModels(entry.models);
      else setFetchedModels([]);
    }).catch(() => setFetchedModels([]));
  }, [form.baseUrl]);

  async function handleFetchModels() {
    if (!form.baseUrl) return;
    setFetchingModels(true);
    setFetchModelsError(null);
    const res = await sendMessage<{ models: string[] }>({
      type:    MessageType.PROVIDER_LIST_MODELS,
      source:  'sidepanel',
      payload: {
        baseUrl: form.baseUrl,
        type:    preset?.type ?? 'openai-compatible',
        ...(form.apiKey ? { apiKey: form.apiKey } : {}),
        ...(isEdit && !form.apiKey && editing?.hasApiKey ? { providerId: editing.id } : {}),
      },
    });
    setFetchingModels(false);
    if (res.success && res.data?.models && res.data.models.length > 0) {
      setFetchedModels(res.data.models);
      // If current model isn't in the list, auto-select the first one
      if (!res.data.models.includes(form.model)) {
        set('model', res.data.models[0]!);
      }
    } else {
      setFetchModelsError(res.error ?? 'No models returned');
    }
  }

  async function handleTest() {
    if (!form.baseUrl) return;
    setTesting(true);
    setTestResult(null);
    const res = await sendMessage({
      type:    MessageType.PROVIDER_TEST,
      source:  'sidepanel',
      payload: {
        baseUrl: form.baseUrl,
        type:    preset?.type ?? 'openai-compatible',
        ...(form.apiKey ? { apiKey: form.apiKey } : {}),
        ...(isEdit && !form.apiKey && editing?.hasApiKey ? { providerId: editing.id } : {}),
      },
    });
    setTesting(false);
    if (res.success) {
      setTestResult('ok');
      // Auto-save on successful test — show brief confirmation before navigating
      if (!isEdit && validate()) {
        setSaving(true);
        setSaveError(null);
        try {
          await add({
            id:        crypto.randomUUID(),
            name:      form.name,
            type:      preset?.type ?? 'openai-compatible',
            baseUrl:   form.baseUrl,
            model:     form.model,
            isDefault: form.isDefault,
            createdAt: Date.now(),
            ...(form.apiKey ? { apiKey: form.apiKey } : {}),
          });
          setSaving(false);
          setTestResult('saved');
          // Brief "Saved!" flash, then navigate
          setTimeout(() => onSaved(), 600);
        } catch (e) {
          setSaving(false);
          setSaveError(e instanceof Error ? e.message : 'Save failed');
        }
      }
    } else {
      setTestResult('fail');
    }
  }

  async function handleSave(skipValidation = false) {
    if (!skipValidation && !validate()) return;
    setSaving(true);
    setSaveError(null);
    try {
      if (isEdit) {
        await update(editing.id, {
          name:      form.name,
          baseUrl:   form.baseUrl,
          model:     form.model,
          isDefault: form.isDefault,
          ...(form.apiKey ? { apiKey: form.apiKey } : {}),
        });
      } else {
        await add({
          id:        crypto.randomUUID(),
          name:      form.name,
          type:      preset?.type ?? 'openai-compatible',
          baseUrl:   form.baseUrl,
          model:     form.model,
          isDefault: form.isDefault,
          createdAt: Date.now(),
          ...(form.apiKey ? { apiKey: form.apiKey } : {}),
        });
      }
      onSaved();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed — check console');
    } finally {
      setSaving(false);
    }
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
        <h2 className="text-sm font-semibold text-ag-text">
          {isEdit ? 'Edit Provider' : 'Add Provider'}
        </h2>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5">
        {/* Preset picker — only in Add mode */}
        {!isEdit && (
          <div>
            <label className="field-label">Provider</label>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {PROVIDER_PRESETS.map(p => (
                <button
                  key={p.id}
                  onClick={() => set('presetId', p.id)}
                  className={`flex flex-col items-center gap-1.5 px-2 py-3 rounded-lg border text-xs font-medium transition-all
                    ${form.presetId === p.id
                      ? 'border-ag-accent bg-ag-accent/10 text-ag-accent'
                      : 'border-ag-border bg-ag-surface text-ag-sub hover:border-ag-muted hover:text-ag-text'
                    }`}
                >
                  <ProviderIcon name={p.id} />
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Name */}
        <Field label="Display Name" error={errors.name}>
          <input
            type="text"
            value={form.name}
            onChange={e => set('name', e.target.value)}
            placeholder={preset?.name ?? 'My Provider'}
            className="ag-input"
          />
        </Field>

        {/* Base URL */}
        <Field label="Base URL" error={errors.baseUrl} hint={
          form.presetId === 'ollama'
            ? 'Default: http://localhost:11434'
            : 'OpenAI-compatible API endpoint'
        }>
          <input
            type="url"
            value={form.baseUrl}
            onChange={e => set('baseUrl', e.target.value)}
            placeholder="https://..."
            className="ag-input font-mono text-xs"
          />
        </Field>

        {/* Model */}
        <Field label="Model" error={errors.model}>
          {(() => {
            const presetModels = preset?.models ?? [];
            const combined = [...new Set([...presetModels, ...fetchedModels])];
            const hasList = combined.length > 0;
            return (
              <div className="space-y-1.5">
                {hasList ? (
                  <select
                    value={combined.includes(form.model) ? form.model : '__custom__'}
                    onChange={e => set('model', e.target.value === '__custom__' ? '' : e.target.value)}
                    className="ag-input"
                  >
                    {combined.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                    <option value="__custom__">Custom model ID…</option>
                  </select>
                ) : null}
                {(!hasList || !combined.includes(form.model)) && (
                  <input
                    type="text"
                    value={form.model === '__custom__' ? '' : form.model}
                    onChange={e => set('model', e.target.value)}
                    placeholder="llama3.2, gpt-4o, claude-3-5-sonnet…"
                    className="ag-input font-mono text-xs"
                  />
                )}
                {form.baseUrl && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleFetchModels()}
                      disabled={fetchingModels}
                      className="text-xs text-ag-accent hover:underline disabled:opacity-50 inline-flex items-center gap-1"
                    >
                      {fetchingModels && <Loader2 size={11} className="animate-spin" />}
                      {fetchingModels ? 'Fetching models…' : (fetchedModels.length > 0 ? 'Refresh models from endpoint' : 'Fetch models from endpoint')}
                    </button>
                    {fetchedModels.length > 0 && (
                      <span className="text-xs text-ag-sub">{fetchedModels.length} discovered</span>
                    )}
                  </div>
                )}
                {fetchModelsError && (
                  <p className="text-xs text-ag-error">{fetchModelsError}</p>
                )}
              </div>
            );
          })()}
        </Field>

        {/* API Key — show when preset requires it, custom, edit, or non-localhost Ollama */}
        {(preset?.requiresKey || form.presetId === 'custom' || isEdit ||
          (form.presetId === 'ollama' && !form.baseUrl.includes('localhost') && !form.baseUrl.includes('127.0.0.1'))) && (
          <Field
            label={isEdit && editing?.hasApiKey ? 'API Key (leave blank to keep current)' : 'API Key'}
            hint={
              preset?.docsUrl
                ? undefined
                : 'Stored encrypted on your device. Never sent to AgentGrow servers.'
            }
          >
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={form.apiKey}
                onChange={e => set('apiKey', e.target.value)}
                placeholder={preset?.keyPlaceholder ?? (isEdit && editing?.hasApiKey ? '••••••••' : 'Paste API key')}
                className="ag-input pr-10 font-mono text-xs"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowKey(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ag-sub hover:text-ag-text"
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            {preset?.docsUrl && (
              <a
                href={preset.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-ag-accent hover:underline mt-1.5"
              >
                Get API key <ExternalLink size={11} />
              </a>
            )}
          </Field>
        )}

        {/* Default toggle */}
        <label className="flex items-center gap-3 cursor-pointer group">
          <div
            onClick={() => set('isDefault', !form.isDefault)}
            className={`w-9 h-5 rounded-full transition-colors relative shrink-0
              ${form.isDefault ? 'bg-ag-accent' : 'bg-ag-muted'}`}
          >
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform
              ${form.isDefault ? 'translate-x-4' : 'translate-x-0.5'}`}
            />
          </div>
          <span className="text-sm text-ag-text group-hover:text-ag-text">Set as default provider</span>
        </label>

        {/* Test connection */}
        {form.baseUrl && (
          <div className="space-y-2">
            <button
              onClick={() => void handleTest()}
              disabled={testing}
              className="flex items-center gap-2 text-sm text-ag-sub border border-ag-border hover:border-ag-muted
                         bg-ag-surface hover:bg-ag-muted rounded-lg px-4 py-2 transition-colors disabled:opacity-50 w-full justify-center"
            >
              {testing && <Loader2 size={14} className="animate-spin" />}
              {testing ? 'Testing connection…' : 'Test connection'}
            </button>
            {testResult === 'ok' && (
              <p className="text-xs text-ag-success text-center">Connection successful</p>
            )}
            {testResult === 'saved' && (
              <p className="text-xs text-ag-success text-center font-semibold">Provider saved — opening chat…</p>
            )}
            {testResult === 'fail' && (
              <p className="text-xs text-ag-error text-center">
                Connection failed — verify the base URL is correct and the API key has access
              </p>
            )}
          </div>
        )}
      </div>

      {/* Save button */}
      <div className="shrink-0 px-4 py-4 border-t border-ag-border bg-ag-surface space-y-2">
        {saveError && (
          <p className="text-xs text-ag-error text-center">{saveError}</p>
        )}
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="w-full bg-ag-accent text-ag-bg font-semibold text-sm py-2.5 rounded-lg
                     hover:bg-ag-success transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add provider'}
        </button>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Field({
  label, error, hint, children,
}: {
  label: string; error?: string | undefined; hint?: string | undefined; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="field-label">{label}</label>
      {children}
      {hint  && !error && <p className="text-xs text-ag-sub">{hint}</p>}
      {error && <p className="text-xs text-ag-error">{error}</p>}
    </div>
  );
}

function ProviderIcon({ name }: { name: string }) {
  const icons: Record<string, string> = {
    openrouter: '🔀',
    openai:     '⬡',
    anthropic:  '◆',
    groq:       '⚡',
    gemini:     '✦',
    ollama:     '🦙',
    custom:     '⚙',
  };
  return <span className="text-base leading-none">{icons[name] ?? '⚙'}</span>;
}
