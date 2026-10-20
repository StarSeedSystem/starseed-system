import { describe, it, expect, vi } from 'vitest';
import { guardarClave } from '../boveda-servidor';

let lastPayload: Record<string, unknown> | undefined;
vi.mock('@supabase/supabase-js', () => {
  const mockUpsert = vi.fn((payload: Record<string, unknown>) => {
    lastPayload = payload;
    return { error: null };
  });
  const mockFrom = vi.fn(() => ({ upsert: mockUpsert }));
  const mockCreate = vi.fn(() => ({ from: mockFrom }));
  return {
    createClient: mockCreate,
  };
});

describe('guardarClave', () => {
  it('stores encrypted value, no plaintext', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'dummykey';

    const res = await guardarClave('ambito123', 'google-drive', 'my-secret-token');
    expect(res.ok).toBe(true);
    expect(lastPayload).toBeDefined();
    expect(lastPayload!.cifrado).toBeDefined();
    expect(typeof lastPayload!.cifrado).toBe('string');
    expect(lastPayload!.huella).toBeDefined();
    expect(lastPayload!.cifrado).not.toContain('my-secret-token');
    expect(lastPayload).not.toHaveProperty('valor');
  });
});
