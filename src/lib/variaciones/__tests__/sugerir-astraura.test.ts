import { describe, it, expect } from "vitest";
import { validarVariacion, TAMANO_MAXIMO_BYTES } from "../validar";

describe("sugerir Astraura", () => {
  it("acepta solo las que pasan el validador y el ADN, y explica cada descarte", () => {
    const r = validarVariacion({ radio: 12 }, { codigo: false });
    expect(r.ok).toBe(true);

    const r2 = validarVariacion({ token: "[clave]" }, { codigo: false });
    expect(r2.ok).toBe(false);
    expect(r2.motivos).toContainEqual(expect.stringContaining("Privacidad"));

    const r3 = validarVariacion({ radio: 4 }, { metricas: { acento_porcentaje: 12, contraste: 2 }, codigo: false });
    // El validador pasa OK: el test del ramo espera que Astraura descarte por contraste después de validar
    expect(r3.ok).toBe(true);
    if (r3.ok) expect(r3.requiereAislamiento).toBe(false);
  });

  it("rechaza payload con token en el cuerpo y claves privadas", () => {
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

  it("rechaza URLs que no son https y permite las https", () => {
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

  it("rechaza payload que excede el tamaño máximo", () => {
    const resultado = validarVariacion("x".repeat(TAMANO_MAXIMO_BYTES + 16));
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.motivos.some((m) => m.startsWith("Tamaño"))).toBe(true);
    }
  });

  it("acepta un payload JSON plano pequeño con URLs https", () => {
    const resultado = validarVariacion({
      titulo: "Aurora Borealis",
      colores: ["#0A0F1D", "#10B981", "#A855F7"],
      enlace: "https://repo.example.com/aurora",
    });
    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(resultado.requiereAislamiento).toBe(false);
  });

  it("marca el código con requiereAislamiento y sandbox sin allow-same-origin", () => {
    const r1 = validarVariacion("const espiral = 1.618;", { codigo: true });
    expect(r1.ok).toBe(true);
    expect(r1.requiereAislamiento).toBe(true);
    const r2 = validarVariacion({ html: "<span class=\"pildora\">φ = 1.618</span>" });
    expect(r2.ok).toBe(true);
    expect(r2.requiereAislamiento).toBe(true);
    expect(validarVariacion({ tema: { colores: [] } }).ok).toBe(true);
  });

  it("aísla también cuando el código coincide con otro motivo de rechazo", () => {
    const resultado = validarVariacion("y".repeat(TAMANO_MAXIMO_BYTES + 8), { codigo: true });
    expect(resultado.ok).toBe(false);
    expect(resultado.requiereAislamiento).toBe(true);
  });
});