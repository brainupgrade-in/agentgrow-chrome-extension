import { describe, expect, it } from 'vitest';

import { isGhewareUrl, parseBalance } from './gheware';

describe('isGhewareUrl', () => {
  it('accepts the Gheware AI gateway', () => {
    expect(isGhewareUrl('https://api.gheware-ai.com/v1')).toBe(true);
    expect(isGhewareUrl('https://api.gheware-ai.com/v1/')).toBe(true);
  });

  it('rejects anything else — a key must never be sent to the token service by mistake', () => {
    expect(isGhewareUrl('http://api.gheware-ai.com/v1')).toBe(false);
    expect(isGhewareUrl('https://api.gheware-ai.com.evil.com/v1')).toBe(false);
    expect(isGhewareUrl('https://evil.com/api.gheware-ai.com/v1')).toBe(false);
    expect(isGhewareUrl('https://tokens.gheware-ai.com/v1')).toBe(false);
    expect(isGhewareUrl('https://api.openai.com/v1')).toBe(false);
    expect(isGhewareUrl('not a url')).toBe(false);
  });
});

describe('parseBalance', () => {
  it('maps the token service response', () => {
    expect(parseBalance({ spend_usd: 0.5, budget_usd: 2.33, remaining_usd: 1.83, active: true }))
      .toEqual({ remainingUsd: 1.83, budgetUsd: 2.33, active: true });
  });

  it('rejects malformed responses', () => {
    expect(parseBalance({ remaining_usd: '1.83' })).toBeNull();
    expect(parseBalance(null)).toBeNull();
  });
});
