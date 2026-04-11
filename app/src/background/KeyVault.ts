/**
 * KeyVault — AES-GCM-256 encrypted storage for API keys.
 * The encryption key lives in chrome.storage.local alongside the ciphertext.
 * Both are wiped on uninstall. The key never leaves the service worker.
 */

const VAULT_KEY_REF  = '__keyvault_key__';
const VAULT_DATA_REF = '__keyvault_data__';

type VaultData = Record<string, { iv: string; ciphertext: string }>;

async function getCryptoKey(): Promise<CryptoKey> {
  const stored = await chrome.storage.local.get(VAULT_KEY_REF);
  if (stored[VAULT_KEY_REF]) {
    const raw = base64ToBuffer(stored[VAULT_KEY_REF] as string);
    return crypto.subtle.importKey('raw', raw.buffer as ArrayBuffer, { name: 'AES-GCM' }, false, [
      'encrypt',
      'decrypt',
    ]);
  }
  // First run — generate and persist a new key
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  const raw = await crypto.subtle.exportKey('raw', key);
  await chrome.storage.local.set({ [VAULT_KEY_REF]: bufferToBase64(raw) });
  return key;
}

async function getVaultData(): Promise<VaultData> {
  const stored = await chrome.storage.local.get(VAULT_DATA_REF);
  return (stored[VAULT_DATA_REF] as VaultData | undefined) ?? {};
}

export const KeyVault = {
  async set(id: string, plaintext: string): Promise<void> {
    const key = await getCryptoKey();
    const iv  = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      enc.encode(plaintext)
    );
    const data = await getVaultData();
    data[id] = { iv: bufferToBase64(iv), ciphertext: bufferToBase64(ciphertext) };
    await chrome.storage.local.set({ [VAULT_DATA_REF]: data });
  },

  async get(id: string): Promise<string | null> {
    const data = await getVaultData();
    const entry = data[id];
    if (!entry) return null;
    try {
      const key = await getCryptoKey();
      const dec = new TextDecoder();
      const iv         = base64ToBuffer(entry.iv);
      const ciphertext = base64ToBuffer(entry.ciphertext);
      const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        ciphertext
      );
      return dec.decode(plain);
    } catch {
      return null;
    }
  },

  async delete(id: string): Promise<void> {
    const data = await getVaultData();
    delete data[id];
    await chrome.storage.local.set({ [VAULT_DATA_REF]: data });
  },

  async has(id: string): Promise<boolean> {
    const data = await getVaultData();
    return id in data;
  },
};

function bufferToBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBuffer(b64: string): Uint8Array<ArrayBuffer> {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  // Ensure backing buffer is always ArrayBuffer (not SharedArrayBuffer)
  return new Uint8Array(bytes.buffer.slice(0) as ArrayBuffer);
}
