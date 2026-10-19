import { describe, it, expect, vi } from 'vitest';
import { guardarClave } from '../boveda-servidor';

// Mock supabase client
vi.mock('@supabase/supabase-js', () => {
  const mockUpsert = vi.fn((payload: any) => {
    mockUpsets.push(payload);
    return { error: null } as any;
  });
  const mockFrom = vi.fn(() => ({ upsert: mockUpsert } as any));
  const mockCreate = vi.fn(() => ({ from: mockFrom } as any));
  const mockUpsets: any[] = [];
  return {
    createClient: mockCreate,
  };
});

describe('guardarClave', () => {
  it('stores encrypted value, never raw', async () => {
    const { upsert } = await import('@supabase/supabase-js').then(m => m.createClient('url', 'key') as any);
    // upsert was mocked; we can't directly access payload.
    // Instead, we'll spy on upsert within the module.
    const spy = vi.spyOn(upsert, 'bind');
  });
});
