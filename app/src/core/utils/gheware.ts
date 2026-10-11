import { z } from 'zod';

/**
 * Gheware AI — the optional prepaid LLM endpoint. Credit is bought on the token
 * service's own pages; the extension only links there and reads the balance.
 */
export const GHEWARE_BUY_URL     = 'https://tokens.gheware-ai.com/buy';
export const GHEWARE_BALANCE_URL = 'https://tokens.gheware-ai.com/v1/balance';

/**
 * True only for the Gheware AI gateway. Gates sending a provider's key to the
 * token service, so it is an exact https + hostname match, never a prefix test.
 */
export function isGhewareUrl(baseUrl: string): boolean {
  try {
    const u = new URL(baseUrl);
    return u.protocol === 'https:' && u.hostname === 'api.gheware-ai.com';
  } catch {
    return false;
  }
}

export interface GhewareBalance {
  remainingUsd: number;
  budgetUsd:    number;
  active:       boolean;
}

const BalanceSchema = z.object({
  remaining_usd: z.number(),
  budget_usd:    z.number(),
  active:        z.boolean(),
});

/** Validate the token service's `/v1/balance` response; null if malformed. */
export function parseBalance(json: unknown): GhewareBalance | null {
  const r = BalanceSchema.safeParse(json);
  if (!r.success) return null;
  return { remainingUsd: r.data.remaining_usd, budgetUsd: r.data.budget_usd, active: r.data.active };
}
