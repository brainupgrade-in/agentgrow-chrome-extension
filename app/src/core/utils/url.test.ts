import { describe, expect, it } from 'vitest';

import { isAllowedProviderUrl, providerSecurityTier } from './url';

// Security rule 9: HTTPS for remote providers; http:// only for localhost / private IPs.
describe('isAllowedProviderUrl', () => {
  it.each([
    'https://openrouter.ai/api/v1',
    'http://localhost:11434',
    'http://127.0.0.1:8000/v1',
    'http://[::1]:11434',
    'http://10.0.0.5:8000',
    'http://172.16.1.1',
    'http://172.31.255.255',
    'http://192.168.1.12:31617',
  ])('allows %s', (url) => {
    expect(isAllowedProviderUrl(url)).toBe(true);
  });

  it.each([
    'http://api.openai.com/v1',
    'http://172.15.0.1',
    'http://172.32.0.1',
    'http://8.8.8.8',
    'ftp://localhost',
    'javascript:alert(1)',
    'not a url',
    '',
  ])('rejects %s', (url) => {
    expect(isAllowedProviderUrl(url)).toBe(false);
  });
});

describe('providerSecurityTier', () => {
  it('classifies endpoints', () => {
    expect(providerSecurityTier('https://api.groq.com')).toBe('secure');
    expect(providerSecurityTier('http://localhost:11434')).toBe('local');
    expect(providerSecurityTier('http://192.168.1.12')).toBe('local');
    expect(providerSecurityTier('http://example.com')).toBe('warning');
    expect(providerSecurityTier('garbage')).toBe('warning');
  });
});
