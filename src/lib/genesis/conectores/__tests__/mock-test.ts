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
      upsert: async () => ({ error: null }),
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { id: "test" }, error: null })
          })
        })
      })
    }),
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: "test-user-id" } }, error: null })
    }
  }))
}));

describe("mock test", () => {
  it("should mock supabase client correctly", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient();
    
    // Test auth.getUser
    const userResult = await supabase.auth.getUser();
    console.log("userResult:", userResult);
    expect(userResult).toEqual({ data: { user: { id: "test-user-id" } }, error: null });
    
    // Test from().upsert()
    const upsertResult = await supabase.from("test").upsert({ test: "value" });
    console.log("upsertResult:", upsertResult);
    expect(upsertResult).toEqual({ error: null });
  });
});