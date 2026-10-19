import { describe, it, expect, vi } from "vitest";

// Mock server-only para permitir la importación en tests
vi.mock("server-only", () => ({}));

// Mock node:fs para manejar la lectura de .env.local
vi.mock("node:fs", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs")>();
  const readFileSync = ((ruta: Parameters<typeof real.readFileSync>[0], ...resto: unknown[]) => {
    if (String(ruta).endsWith(".env.local")) {
      throw Object.assign(new Error("ENOENT: .env.local fuera de las pruebas"), { code: "ENOENT" });
    }
    return (real.readFileSync as (...a: unknown[]) => unknown)(ruta, ...resto);
  }) as typeof real.readFileSync;
  return { ...real, default: { ...real, readFileSync }, readFileSync };
});

// Mock @supabase/supabase-js para proporcionar un cliente Supabase falso
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: () => ({
      select: () => ({
        eq: (column: string, value: any) => ({
          single: async () => ({ data: { id: "test", error: null } })
        })
      })
    }),
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: "test-user-id" } }, error: null })
    }
  }))
}));

describe("simple mock test", () => {
  it("should mock supabase client correctly", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient();
    
    // Test auth.getUser
    const userResult = await supabase.auth.getUser();
    expect(userResult).toEqual({ data: { user: { id: "test-user-id" } }, error: null });
    
    // Test from().select().eq().single()
    const queryResult = await supabase.from("test").select("id").eq("id", "some-value").single();
    expect(queryResult).toEqual({ data: { id: "test" }, error: null });
  });
});