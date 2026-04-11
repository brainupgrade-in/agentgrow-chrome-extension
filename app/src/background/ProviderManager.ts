import { KeyVault } from './KeyVault.js';
import { safeStorageSet } from '../core/utils/storage.js';
import type { ProviderConfig, ProviderConfigPublic } from '../core/types/provider.js';

const STORAGE_KEY = 'providers';

async function load(): Promise<ProviderConfig[]> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return (stored[STORAGE_KEY] as ProviderConfig[] | undefined) ?? [];
}

async function save(providers: ProviderConfig[]): Promise<void> {
  await safeStorageSet({ [STORAGE_KEY]: providers });
}

async function toPublic(p: ProviderConfig): Promise<ProviderConfigPublic> {
  const { keyRef: _, ...rest } = p;
  return { ...rest, hasApiKey: p.keyRef ? await KeyVault.has(p.keyRef) : false };
}

export const ProviderManager = {
  async list(): Promise<ProviderConfigPublic[]> {
    const providers = await load();
    return Promise.all(providers.map(toPublic));
  },

  async add(config: Omit<ProviderConfig, 'keyRef'> & { apiKey?: string }): Promise<ProviderConfigPublic> {
    const providers = await load();

    // If this is the first provider, make it default
    const isDefault = providers.length === 0 ? true : config.isDefault;

    // If marked default, un-default the rest
    const updated = isDefault
      ? providers.map(p => ({ ...p, isDefault: false }))
      : [...providers];

    const keyRef = config.id;
    if (config.apiKey) {
      await KeyVault.set(keyRef, config.apiKey);
    }

    const newProvider: ProviderConfig = {
      id:        config.id,
      name:      config.name,
      type:      config.type,
      baseUrl:   config.baseUrl,
      model:     config.model,
      isDefault,
      createdAt: config.createdAt,
      keyRef:    config.apiKey ? keyRef : undefined,
    };

    updated.push(newProvider);
    await save(updated);
    return toPublic(newProvider);
  },

  async update(
    id: string,
    patch: Partial<Omit<ProviderConfig, 'id' | 'createdAt' | 'keyRef'>> & { apiKey?: string }
  ): Promise<ProviderConfigPublic> {
    const providers = await load();
    const idx = providers.findIndex(p => p.id === id);
    if (idx === -1) throw new Error(`Provider not found: ${id}`);

    if (patch.apiKey) {
      await KeyVault.set(id, patch.apiKey);
      providers[idx] = { ...providers[idx], ...patch, keyRef: id };
    } else {
      providers[idx] = { ...providers[idx], ...patch };
    }

    // If setting as default, un-default the rest
    if (patch.isDefault) {
      for (let i = 0; i < providers.length; i++) {
        if (i !== idx) providers[i] = { ...providers[i], isDefault: false };
      }
    }

    await save(providers);
    return toPublic(providers[idx]);
  },

  async delete(id: string): Promise<void> {
    const providers = await load();
    const remaining = providers.filter(p => p.id !== id);

    // If we deleted the default, promote the first remaining
    if (providers.find(p => p.id === id)?.isDefault && remaining.length > 0) {
      remaining[0] = { ...remaining[0], isDefault: true };
    }

    await KeyVault.delete(id);
    await save(remaining);
  },

  async setDefault(id: string): Promise<void> {
    const providers = await load();
    const updated = providers.map(p => ({ ...p, isDefault: p.id === id }));
    await save(updated);
  },

  async getDefault(): Promise<ProviderConfig | null> {
    const providers = await load();
    return providers.find(p => p.isDefault) ?? providers[0] ?? null;
  },

  async getApiKey(id: string): Promise<string | null> {
    return KeyVault.get(id);
  },

  /** Returns the full internal config (for service-worker use only) */
  async getConfig(id: string): Promise<ProviderConfig | null> {
    const providers = await load();
    return providers.find(p => p.id === id) ?? null;
  },
};
