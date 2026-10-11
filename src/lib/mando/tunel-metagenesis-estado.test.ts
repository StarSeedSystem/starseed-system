import { describe, it, expect } from 'vitest';
import { tachar } from './tunel-metagenesis-estado';

describe('tachar', () => {
  it('should replace trycloudflare URLs with [túnel]', () => {
    expect(
      tachar('Visita https://abc123.trycloudflare.com para más info')
    ).toBe('Visita [túnel] para más info');

    expect(
      tachar('Múltiples: https://foo-bar.trycloudflare.com y https://test.trycloudflare.com')
    ).toBe('Múltiples: [túnel] y [túnel]');

    expect(tachar('Sin URL')).toBe('Sin URL');
    expect(tachar('')).toBe('');
    expect(tachar('https://other.com')).toBe('https://other.com');
  });
});