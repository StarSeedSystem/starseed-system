/**
 * Boveda de claves por ámbito (servidor)
 * Versión 2 para evitar problemas de caché con vi.mock
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
        eq: (column: string, value: any) => ({
          // Support for chaining another eq call
          eq: (column2: string, value2: any) => ({
            // Support for is() call after two eqs
            is: (column3: string, value3: any) => ({
              single: async () => ({ data: { cifrado: "test-encrypted" }, error: null }),
              maybeSingle: async () => ({ data: { cifrado: "test-encrypted" }, error: null })
            }),
            // Support for ending the chain with single/maybeSingle after two eqs
            single: async () => ({ data: { id: "test", error: null } }),
            maybeSingle: async () => ({ data: { id: "test" }, error: null })
          }),
          // Support for ending the chain with single/maybeSingle after one eq
          single: async () => ({ data: { id: "test", error: null } }),
          maybeSingle: async () => ({ data: { id: "test" }, error: null })
        })
      })
    }),
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: "test-user-id" } }, error: null })
    }
  }))
}));

describe("boveda-servidor-v2", () => {
  const entorno = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proyecto-de-prueba.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "clave-de-servicio-de-prueba-bien-larga";
  });

  afterEach(() => {
    process.env = { ...entorno };
  });

  describe("cifrar/descifrar", () => {
    it("cifra y descifra el mismo texto (ida y vuelta)", async () => {
      const { cifrar, descifrar } = await import("../boveda-servidor");
      const original = "mi-clave-secreta-123";
      const cifrado = cifrar(original);
      const descifrado = descifrar(cifrado);
      
      expect(cifrado).not.toBe(original);
      expect(cifrado.startsWith("v1:")).toBe(true);
      expect(descifrado).toBe(original);
    });
  });

  describe("guardarClave y usarClave", () => {
    it("falla CERRADO sin SUPABASE_SERVICE_ROLE_KEY (nunca cifra con una clave débil implícita)", async () => {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      const { cifrar } = await import("../boveda-servidor");
      expect(() => cifrar("x")).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
    });

    it("guardarClave -> usarClave: round-trip completo contra el cliente Supabase falso", async () => {
      const { guardarClave, usarClave } = await import("../boveda-servidor");
      const ambitoId = "ambito-abc";
      const proveedor = "proveedor-test";
      const valorSecreto = "mi-valor-secreto-123";
      
      // Guardar la clave
      const guardado = await guardarClave({
        ambito: ambitoId,
        proveedor,
        valor: valorSecreto,
      });
      console.log("guardarClave result:", guardado);
      if (!guardado.ok) {
        console.error("guardarClave failed:", guardado.error);
      }
      expect(guardado.ok).toBe(true);
      
      // Usar la clave (debería devolver el mismo valor)
      const valorRecuperado = await usarClave(ambitoId, proveedor, (valor) => {
        return Promise.resolve(valor);
      });
      expect(valorRecuperado).toBe(valorSecreto);
    });

    it("usarClave lanza error si la clave no existe", async () => {
      const { usarClave } = await import("../boveda-servidor");
      
      await expect(async () => {
        return await usarClave("ambito-inexistente", "proveedor-inexistente", (valor) => {
          return Promise.resolve(valor);
        });
      }).rejects.toThrow();
    });
  });
});