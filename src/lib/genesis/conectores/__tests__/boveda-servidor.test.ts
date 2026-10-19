/**
 * Boveda de claves por ámbito (servidor)
 * Cubre: ida y vuelta del cifrado AES-256-GCM, rechazo ante manipulación
 * (tag de autenticación), y funciones básicas de la bóveda
 * contra un cliente Supabase FALSO (nunca toca una base de datos real).
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
        eq: (column: string, value: string) => ({
          eq: (column2: string, value2: string) => ({
            single: async () => ({ data: { id: "test", error: null } }),
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

describe("boveda-servidor", () => {
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

    it("dos cifrados del MISMO texto son distintos (IV aleatorio) pero ambos descifran igual", async () => {
      const { cifrar, descifrar } = await import("../boveda-servidor");
      const a = cifrar("mismo-secreto");
      const b = cifrar("mismo-secreto");
      expect(a).not.toBe(b);
      expect(descifrar(a)).toBe("mismo-secreto");
      expect(descifrar(b)).toBe("mismo-secreto");
    });

    it("RECHAZA una credencial cifrada manipulada (tag de autenticación no verifica)", async () => {
      const { cifrar, descifrar } = await import("../boveda-servidor");
      const cifrado = cifrar("refresh-token-sensible");
      const partes = cifrado.split(":");
      // Corrompe un byte del ciphertext (última parte, base64).
      const dataCorrupta = partes[3].slice(0, -4) + (partes[3].slice(-4) === "AAAA" ? "BBBB" : "AAAA");
      const manipulado = [partes[0], partes[1], partes[2], dataCorrupta].join(":");
      expect(() => descifrar(manipulado)).toThrow();
    });

    it("RECHAZA un formato no reconocido (versión distinta, partes de más/menos)", async () => {
      const { descifrar } = await import("../boveda-servidor");
      expect(() => descifrar("v2:algo:algo:algo")).toThrow();
      expect(() => descifrar("solo-una-parte")).toThrow();
    });
  });

  describe("guardarClave y usarClave", () => {
    it("falla CERRADO sin SUPABASE_SERVICE_ROLE_KEY (nunca cifra con una clave débil implícita)", async () => {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      const { cifrar } = await import("../boveda-servidor");
      expect(() => cifrar("x")).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
    });

    it("should test that mock is working", async () => {
      const { guardarClave } = await import("../boveda-servidor");
      // This test will fail for other reasons, but let's see if we get past the mock issues
      expect(typeof guardarClave).toBe("function");
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

  describe("revocar", () => {
    it("revocar marca la clave como revocada", async () => {
      const { guardarClave, usarClave, revocar } = await import("../boveda-servidor");
      const ambitoId = "ambito-revocacion";
      const proveedor = "proveedor-test";
      const valorSecreto = "valor-para-revocacion";
      
      // Guardar la clave
      await guardarClave({
        ambito: ambitoId,
        proveedor,
        valor: valorSecreto,
      });
      
      // Verificar que podemos usarla
      let valorUsado = "";
      await usarClave(ambitoId, proveedor, (valor) => {
        valorUsado = valor;
        return Promise.resolve(true);
      });
      expect(valorUsado).toBe(valorSecreto);
      
      // Revocar la clave
      const revocado = await revocar({
        ambito: ambitoId,
        proveedor,
      });
      expect(revocado.ok).toBe(true);
      
      // Verificar que ya no podemos usarla
      await expect(async () => {
        return await usarClave(ambitoId, proveedor, (valor) => {
          return Promise.resolve(valor);
        });
      }).rejects.toThrow();
    });
  });
});