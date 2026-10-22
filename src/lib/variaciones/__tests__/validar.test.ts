import { describe, it, expect } from "vitest";
import { validarVariacion, TAMANO_MAXIMO_BYTES, SANDBOX_CODIGO } from "../validar";

describe("validarVariacion", () => {
  it("acepta un payload JSON plano pequeño con URLs https", () => {
    const resultado = validarVariacion({
      titulo: "Aurora Borealis",
      colores: ["#0A0F1D", "#10B981", "#A855F7"],
      enlace: "https://repo.example.com/aurora",
    });
    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(resultado.requiereAislamiento).toBe(false);
  });

  it("rechaza un payload que supera el tamaño máximo", () => {
    const resultado = validarVariacion("x".repeat(TAMANO_MAXIMO_BYTES + 16));
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.motivos.some((m) => m.startsWith("Tamaño"))).toBe(true);
    }
  });

  it("rechaza funciones y valores no serializables", () => {
    const resultado = validarVariacion({ aplicar: () => {}, palanca: undefined });
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.motivos.some((m) => m.includes("no serializable"))).toBe(true);
    }
  });

  it("rechaza objetos que no son JSON plano", () => {
    const resultado = validarVariacion({ pasos: new Map([["a", 1]]) });
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.motivos.some((m) => m.includes("no es JSON plano"))).toBe(true);
    }
  });

  it("rechaza un payload circular", () => {
    const ciclo: Record<string, unknown> = { nombre: "espiral" };
    ciclo.padre = ciclo;
    const resultado = validarVariacion(ciclo);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.motivos.some((m) => m.includes("no se puede serializar"))).toBe(true);
    }
  });

  it("rechaza claves privadas de la cuenta (SYNCED_KEYS)", () => {
    for (const payload of [
      { "starseed.dock.items.v2": { orden: [] } },
      { ajustes: { "appearance-config-v2": 1 } },
      { tablero: "os.trinity.fab" },
      { memoria: "starseed_user_memory" },
    ]) {
      const resultado = validarVariacion(payload);
      expect(resultado.ok).toBe(false);
      if (!resultado.ok) {
        expect(resultado.motivos.some((m) => m.startsWith("Privacidad"))).toBe(true);
      }
    }
  });

  it("rechaza valores que parecen un token o una clave", () => {
    for (const payload of ["sk-fake123def456ghi789", "Bearer abcdefgh12345", "a".repeat(40)]) {
      const resultado = validarVariacion(payload);
      expect(resultado.ok).toBe(false);
      if (!resultado.ok) {
        expect(resultado.motivos.some((m) => m.includes("token"))).toBe(true);
      }
    }
    expect(validarVariacion("Una frase normal con espacios y acentos").ok).toBe(true);
  });

  it("rechaza URLs que no son https", () => {
    for (const enlace of [
      "http://example.com/tema.json",
      "//example.com/tema.json",
      "ftp://example.com/tema.json",
      "data:image/png;base64,AAAA",
      "javascript:void(0)",
    ]) {
      const resultado = validarVariacion({ enlace });
      expect(resultado.ok).toBe(false);
      if (!resultado.ok) {
        expect(resultado.motivos.some((m) => m.startsWith("Url"))).toBe(true);
      }
    }
    expect(validarVariacion({ enlace: "https://example.com/tema.json" }).ok).toBe(true);
  });

  it("marca el código con requiereAislamiento y sandbox sin allow-same-origin", () => {
    expect(SANDBOX_CODIGO).toBe("allow-scripts");
    expect(SANDBOX_CODIGO.includes("same-origin")).toBe(false);
    const declarado = validarVariacion("const espiral = 1.618;", { codigo: true });
    if (declarado.ok) expect(declarado.requiereAislamiento).toBe(true);
    else expect.unreachable("un payload válido debería aceptarse");
    const detectado = validarVariacion({ html: "<span class=\"pildora\">φ = 1.618</span>" });
    expect(detectado.ok).toBe(true);
    if (detectado.ok) expect(detectado.requiereAislamiento).toBe(true);
    expect(validarVariacion({ tema: { colores: [] } }).ok).toBe(true);
  });

  it("aísla también cuando el código coincide con otro motivo de rechazo", () => {
    const resultado = validarVariacion("y".repeat(TAMANO_MAXIMO_BYTES + 8), { codigo: true });
    expect(resultado.ok).toBe(false);
    expect(resultado.requiereAislamiento).toBe(true);
  });
});
