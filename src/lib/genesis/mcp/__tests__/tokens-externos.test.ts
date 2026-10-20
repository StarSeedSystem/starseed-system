import { describe, it, expect, beforeEach } from "vitest";
import { crearToken, verificarToken, setStorage } from "../index.ts";

describe("Token externo", () => {
  let mockStorage: { [key: string]: string } = {};

  beforeEach(() => {
    mockStorage = {};
    setStorage({
      getItem: (key: string) => mockStorage[key] || null,
      setItem: (key: string, value: string) => {
        mockStorage[key] = value;
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      }
    });
  });

  it("crea un token y lo verifica exitosamente", () => {
    const token = crearToken("test-scope", "test-alcance", Date.now() + 3600000);
    expect(token).toBeTruthy();
    expect(typeof token).toBe("string");

    const resultado = verificarToken(token);
    expect(resultado).toEqual({
      ambito: "test-scope",
      alcance: "test-alcance"
    });
  });

  it("rechaza un token inexistente", () => {
    const token = "fake-token-12345";
    const resultado = verificarToken(token);
    expect(resultado).toBeNull();
  });

  it("rechaza un token revocado", () => {
    const token = crearToken("test-scope", "test-alcance", Date.now() + 3600000);
    const hash = Array.from(new Uint8Array(crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    mockStorage[`ssm_${hash}`] = JSON.stringify({
      ambito: "test-scope",
      alcance: "test-alcance",
      caduca: Date.now() + 3600000,
      usos: 0,
      revocado: true
    });
    const resultado = verificarToken(token);
    expect(resultado).toBeNull();
  });

  it("rechaza un token caducado", () => {
    const token = crearToken("test-scope", "test-alcance", Date.now() - 3600000);
    const resultado = verificarToken(token);
    expect(resultado).toBeNull();
  });

  it("incrementa el contador de usos en verificación exitosa", () => {
    const token = crearToken("test-scope", "test-alcance", Date.now() + 3600000);
    verificarToken(token);
    verificarToken(token);
    const hash = Array.from(new Uint8Array(crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const registro = JSON.parse(mockStorage[`ssm_${hash}`] || "{}");
    expect(registro.usos).toBe(2);
  });
});