const QUOTA_WARN_BYTES  = 8_000_000 * 0.85; // 85% of 8 MB
const QUOTA_LIMIT_BYTES = 8_000_000;

/**
 * Wrapper around chrome.storage.local.set that checks quota first.
 * Throws if the storage would exceed hard limit.
 * Logs a warning at 85%.
 */
export async function safeStorageSet(
  items: Record<string, unknown>
): Promise<void> {
  const used = await chrome.storage.local.getBytesInUse(null);
  const projected = used + roughSize(items);

  if (projected > QUOTA_LIMIT_BYTES) {
    throw new Error(
      `Storage quota exceeded: ${used} bytes used, cannot add more.`
    );
  }
  if (projected > QUOTA_WARN_BYTES) {
    console.warn(
      `[AgentGrow] Storage at ${Math.round((projected / QUOTA_LIMIT_BYTES) * 100)}% capacity`
    );
  }

  return chrome.storage.local.set(items);
}

/** Fast, rough estimate of serialised size in bytes */
function roughSize(obj: unknown): number {
  return new TextEncoder().encode(JSON.stringify(obj)).length;
}
