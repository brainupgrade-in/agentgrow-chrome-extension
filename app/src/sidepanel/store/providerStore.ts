import { create } from 'zustand';
import { MessageType } from '../../core/types/messages.js';
import type { ProviderConfigPublic } from '../../core/types/provider.js';
import { sendMessage } from '../utils/messaging.js';

interface ProviderState {
  providers:        ProviderConfigPublic[];
  activeProviderId: string | null;
  activeModel:      string | null;
  loading:          boolean;
  error:            string | null;

  load:       () => Promise<void>;
  add:        (data: AddProviderPayload) => Promise<void>;
  update:     (id: string, patch: UpdateProviderPayload) => Promise<void>;
  remove:     (id: string) => Promise<void>;
  setActive:  (providerId: string, model: string) => void;
}

export interface AddProviderPayload {
  id:        string;
  name:      string;
  type:      'openai-compatible' | 'ollama';
  baseUrl:   string;
  model:     string;
  isDefault: boolean;
  createdAt: number;
  apiKey?:   string;
}

export interface UpdateProviderPayload {
  name?:      string;
  baseUrl?:   string;
  model?:     string;
  isDefault?: boolean;
  apiKey?:    string;
}

const ACTIVE_KEY = 'activeProvider';

/** Persist active selection to chrome.storage.local */
function saveActive(providerId: string | null, model: string | null) {
  chrome.storage.local.set({ [ACTIVE_KEY]: { providerId, model } }).catch(() => {});
}

/** Restore active selection from chrome.storage.local */
async function restoreActive(): Promise<{ providerId: string | null; model: string | null }> {
  try {
    const stored = await chrome.storage.local.get(ACTIVE_KEY);
    const data = stored[ACTIVE_KEY] as { providerId?: string; model?: string } | undefined;
    return { providerId: data?.providerId ?? null, model: data?.model ?? null };
  } catch {
    return { providerId: null, model: null };
  }
}

export const useProviderStore = create<ProviderState>((set, get) => ({
  providers:        [],
  activeProviderId: null,
  activeModel:      null,
  loading:          false,
  error:            null,

  async load() {
    set({ loading: true, error: null });
    try {
      const res = await sendMessage<ProviderConfigPublic[]>({
        type:   MessageType.PROVIDER_LIST,
        source: 'sidepanel',
      });
      if (res.success && res.data) {
        const providers = res.data;
        const current = get();

        // Restore persisted selection if current is null (cold start)
        let activeId = current.activeProviderId;
        let activeModel = current.activeModel;
        if (!activeId) {
          const saved = await restoreActive();
          activeId = saved.providerId;
          activeModel = saved.model;
        }

        // Keep active selection if it still exists, otherwise pick the default
        const stillExists = providers.find(p => p.id === activeId);
        const def = providers.find(p => p.isDefault) ?? providers[0];
        const finalId    = stillExists ? activeId     : (def?.id    ?? null);
        const finalModel = stillExists ? activeModel  : (def?.model ?? null);

        set({ providers, activeProviderId: finalId, activeModel: finalModel });
        saveActive(finalId, finalModel);
      }
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ loading: false });
    }
  },

  async add(data) {
    set({ loading: true, error: null });
    try {
      const res = await sendMessage<ProviderConfigPublic>({
        type:    MessageType.PROVIDER_ADD,
        source:  'sidepanel',
        payload: data as unknown as Record<string, unknown>,
      });
      if (!res.success || !res.data) {
        throw new Error(res.error ?? 'Failed to add provider');
      }
      // Reload from storage to confirm persistence
      const listRes = await sendMessage<ProviderConfigPublic[]>({
        type:   MessageType.PROVIDER_LIST,
        source: 'sidepanel',
      });
      if (listRes.success && listRes.data) {
        const providers = listRes.data;
        const def = providers.find(p => p.isDefault) ?? providers[0];
        set({
          providers,
          activeProviderId: def?.id   ?? null,
          activeModel:      def?.model ?? null,
        });
      }
    } catch (e) {
      set({ error: String(e) });
      throw e;   // re-throw so handleSave doesn't navigate
    } finally {
      set({ loading: false });
    }
  },

  async update(id, patch) {
    set({ loading: true, error: null });
    try {
      const res = await sendMessage<ProviderConfigPublic>({
        type:    MessageType.PROVIDER_UPDATE,
        source:  'sidepanel',
        payload: { id, ...patch } as unknown as Record<string, unknown>,
      });
      if (!res.success || !res.data) {
        throw new Error(res.error ?? 'Failed to update provider');
      }
      set(s => ({
        providers: s.providers.map(p => p.id === id ? res.data! : p),
      }));
    } catch (e) {
      set({ error: String(e) });
      throw e;   // re-throw so handleSave doesn't navigate
    } finally {
      set({ loading: false });
    }
  },

  async remove(id) {
    set({ loading: true, error: null });
    try {
      await sendMessage({ type: MessageType.PROVIDER_DELETE, source: 'sidepanel', payload: { id } });
      set(s => {
        const providers = s.providers.filter(p => p.id !== id);
        const def = providers.find(p => p.isDefault) ?? providers[0];
        return {
          providers,
          activeProviderId: s.activeProviderId === id ? (def?.id ?? null) : s.activeProviderId,
          activeModel:      s.activeProviderId === id ? (def?.model ?? null) : s.activeModel,
        };
      });
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ loading: false });
    }
  },

  setActive(providerId, model) {
    set({ activeProviderId: providerId, activeModel: model });
    saveActive(providerId, model);
  },
}));
