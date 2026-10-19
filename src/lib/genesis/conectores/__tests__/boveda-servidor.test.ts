import { describe, it, expect, vi } from 'vitest';
import { guardarClave } from '../boveda-servidor';

let lastPayload: any;
// Mock supabase client used in module
vi.mock('@supabase/supabase-js', () => {
  const mockUpsert = vi.fn((payload: any) => {
    lastPayload = payload;
    return { error: null } as any;
  });
  const mockFrom = vi.fn(() => ({ upsert: mockUpsert } as any));
  const mockCreate = vi.fn(() => ({ from: mockFrom } as any));
  return {
    createClient: mockCreate,
  };
});

describe('guardarClave', () => {
  it('stores encrypted value, no plaintext', async () => {
    // Ensure env vars exist so serviceClient returns a client
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'dummykey';

    const res = await guardarClave('ambito123', 'google-drive', 'my-secret-token');
    expect(res.ok).toBe(true);
    // Payload should not contain raw token
    expect(lastPayload).toBeDefined();
    expect(lastPayload.cifrado).toBeDefined();
    expect(lastPayload.iv).toBeDefined();
    expect(lastPayload.huella).toBeDefined();
    expect(lastPayload.cifrado).not.toContain('my-secret-token');
    expect(lastPayload).not.toHaveProperty('valor');
  });
});
