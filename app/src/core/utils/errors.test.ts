import { describe, expect, it } from 'vitest';

import { friendlyHttpError } from './errors';

describe('friendlyHttpError', () => {
  it('maps the existing status codes', () => {
    expect(friendlyHttpError(401, '', 'm')).toMatch(/Invalid API key/);
    expect(friendlyHttpError(403, '', 'm')).toMatch(/Access denied/);
    expect(friendlyHttpError(429, '', 'm')).toMatch(/Rate limited/);
    expect(friendlyHttpError(404, '', 'gpt-x')).toMatch(/"gpt-x"/);
    expect(friendlyHttpError(502, '', 'm')).toMatch(/Provider server error \(502\)/);
    expect(friendlyHttpError(418, 'teapot', 'm')).toBe('API error 418: teapot');
  });

  it('turns a used-up key budget into a top-up prompt', () => {
    const body = '{"error":{"message":"Budget has been exceeded! Current cost: 2.34, Max budget: 2.33","type":"budget_exceeded"}}';
    expect(friendlyHttpError(400, body, 'gw-qwen36-chat', true)).toMatch(/Gheware AI credit is used up.*top up/i);
    // another LiteLLM-based provider: generic wording, no Gheware branding
    expect(friendlyHttpError(400, body, 'gpt-x', false)).toMatch(/^Budget exceeded on this provider/);
  });

  it('distinguishes a team ceiling from the customer budget', () => {
    const body = 'Budget has been exceeded! Team=agentgrow Current cost: 100, Max budget: 100';
    expect(friendlyHttpError(400, body, 'gw-qwen36-chat', true)).toMatch(/temporarily at capacity/i);
  });

  it('truncates unknown error bodies', () => {
    expect(friendlyHttpError(400, 'x'.repeat(500), 'm')).toHaveLength('API error 400: '.length + 200);
  });
});
