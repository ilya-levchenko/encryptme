import { describe, expect, it } from 'vitest';
import { assertAllowedExternalUrl } from './external-url';

describe('external URL policy', () => {
  it('allows the author email and official project destinations', () => {
    expect(assertAllowedExternalUrl('mailto:ilya_encryptme@proton.me')).toBe('mailto:ilya_encryptme@proton.me');
    expect(assertAllowedExternalUrl('https://github.com/ilya-levchenko/encryptme')).toContain('github.com');
    expect(assertAllowedExternalUrl('https://tronscan.org/#/address/TL7QuKcQWFcHKM9U98y9e4h9CpducJQTjg')).toContain('tronscan.org');
  });

  it('rejects arbitrary hosts, credentials, scripts and lookalike domains', () => {
    for (const url of ['javascript:alert(1)', 'https://evil.example', 'https://github.com.evil.example/x', 'https://user:pass@github.com/x']) {
      expect(() => assertAllowedExternalUrl(url)).toThrow('EXTERNAL_URL_NOT_ALLOWED');
    }
  });
});
