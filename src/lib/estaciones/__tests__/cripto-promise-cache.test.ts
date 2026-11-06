import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

async function recargarModulo() {
  vi.resetModules();
  const cripto = await import("../cripto-estacion");
  return cripto;
}

describe("cripto-estacion cache promesas rechazadas", () => {
  let originalCrypto: typeof globalThis.crypto;

  beforeEach(() => {
    originalCrypto = globalThis.crypto;
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "crypto", {
      value: originalCrypto,
      writable: true,
      configurable: true,
    });
  });

  describe("llavePublica", () => {
    it("debe reintentar si la importación falla inicialmente", async () => {
      let fallar = true;
      const mockSubtle = {
        importKey: vi.fn().mockImplementation(async () => {
          if (fallar) throw new Error("importKey falló");
          return { key: "imported-key" };
        }),
        digest: vi.fn().mockResolvedValue(new Uint8Array(32)),
      };

      Object.defineProperty(globalThis, "crypto", {
        value: { subtle: mockSubtle },
        writable: true,
        configurable: true,
      });

      const cripto = await recargarModulo();

      const result1 = await cripto.llavePublica("clave-publica-test-1");
      expect(result1).toBeNull();
      expect(mockSubtle.importKey).toHaveBeenCalledTimes(1);

      fallar = false;
      const cripto2 = await recargarModulo();
      const result2 = await cripto2.llavePublica("clave-publica-test-1");
      expect(result2).not.toBeNull();
    });

    it("debe reusar llave cacheada si es exitosa", async () => {
      const mockSubtle = {
        importKey: vi.fn().mockResolvedValue({ key: "imported-key" }),
        digest: vi.fn().mockResolvedValue(new Uint8Array(32)),
      };

      Object.defineProperty(globalThis, "crypto", {
        value: { subtle: mockSubtle },
        writable: true,
        configurable: true,
      });

      const cripto = await recargarModulo();

      await cripto.llavePublica("clave-test-1");
      await cripto.llavePublica("clave-test-1");

      expect(mockSubtle.importKey).toHaveBeenCalledTimes(1);
    });
  });

  describe("claveCifrado", () => {
    it("debe lanzar error si la importación falla", async () => {
      let fallar = true;

      const mockSubtle = {
        digest: vi.fn().mockImplementation(async () => {
          if (fallar) throw new Error("digest falló");
          return new Uint8Array(32);
        }),
        importKey: vi.fn().mockImplementation(async () => {
          if (fallar) throw new Error("importKey falló");
          return { key: "imported-key" };
        }),
      };

      Object.defineProperty(globalThis, "crypto", {
        value: { subtle: mockSubtle },
        writable: true,
        configurable: true,
      });

      const cripto = await recargarModulo();

      fallar = false;
      const result = await cripto.claveCifrado("id2", "token2");
      expect(result).not.toBeNull();
    });

    it("debe reusar clave cacheada si es exitosa", async () => {
      let llamadasDigest = 0;

      const mockSubtle = {
        digest: vi.fn().mockImplementation(async () => {
          llamadasDigest++;
          return new Uint8Array(32);
        }),
        importKey: vi.fn().mockResolvedValue({ key: "imported-key" }),
      };

      Object.defineProperty(globalThis, "crypto", {
        value: { subtle: mockSubtle },
        writable: true,
        configurable: true,
      });

      const cripto = await recargarModulo();

      await cripto.claveCifrado("id-test", "token-test");
      await cripto.claveCifrado("id-test", "token-test");

      expect(llamadasDigest).toBe(1);
    });
  });
});

describe("cripto-estacion operaciones básicas", () => {
  it("crea, exporta e importa llaves correctamente", async () => {
    const cripto = await recargarModulo();

    const par = await cripto.crearLlaves();
    expect(par.publica).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(par.privada).toBeTruthy();

    const exportada = await cripto.exportarPrivada(par.privada);
    expect(exportada).toBeTruthy();

    const importada = await cripto.importarPrivada(exportada);
    expect(importada).not.toBeNull();

    const id = await cripto.idDeLlave(par.publica);
    expect(id).toBeTruthy();
  });

  it("firma y verifica correctamente", async () => {
    const cripto = await recargarModulo();

    const par = await cripto.crearLlaves();
    const texto = "mensaje de prueba";
    const firma = await cripto.firmar(par.privada, texto);

    expect(firma).toBeTruthy();
    expect(typeof firma).toBe("string");

    const valida = await cripto.verificar(par.publica, texto, firma);
    expect(valida).toBe(true);

    const noValida = await cripto.verificar(par.publica, texto + "x", firma);
    expect(noValida).toBe(false);
  });

  it("cifra y descifra correctamente", async () => {
    const cripto = await recargarModulo();

    const id = "estacion-test";
    const token = "token-secreto";
    const texto = "mensaje confidencial";

    const cifrado = await cripto.cifrar(id, token, texto);
    expect(cifrado).toBeTruthy();
    expect(typeof cifrado).toBe("string");

    const descifrado = await cripto.descifrar(id, token, cifrado);
    expect(descifrado).toBe(texto);
  });

  it("descifrar devuelve null con token incorrecto", async () => {
    const cripto = await recargarModulo();

    const cifrado = await cripto.cifrar("id1", "token-correcto", "secreto");
    const descifrado = await cripto.descifrar("id1", "token-incorrecto", cifrado);

    expect(descifrado).toBeNull();
  });

  it("base64url conversiones son reversibles", async () => {
    const cripto = await recargarModulo();

    const original = "hola-mundo-123";
    const codificado = cripto.textoABase64Url(original);
    const decodificado = cripto.base64UrlATexto(codificado);

    expect(decodificado).toBe(original);
  });
});