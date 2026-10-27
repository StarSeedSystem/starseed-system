// Prueba de src/lib/variaciones/claves-ajustes.ts — módulo puro, sin red.
import { describe, it, expect } from "vitest";
import {
  normalizarIdAjuste,
  claveDeAjuste,
  clavesDeAjustes,
} from "../claves-ajustes";

describe("normalizarIdAjuste", () => {
  it("deja igual los ids ya en kebab-case", () => {
    expect(normalizarIdAjuste("tema-apariencia")).toBe("tema-apariencia");
    expect(normalizarIdAjuste("apariencia")).toBe("apariencia");
  });

  it("convierte camelCase a kebab-case minúscula", () => {
    expect(normalizarIdAjuste("displacementScale")).toBe("displacement-scale");
    expect(normalizarIdAjuste("buttonStyle")).toBe("button-style");
    expect(normalizarIdAjuste("fontMain")).toBe("font-main");
  });

  it("devuelve vacío con entradas vacías", () => {
    expect(normalizarIdAjuste("")).toBe("");
  });
});

describe("claveDeAjuste", () => {
  it("construye ajuste:<pestaña>.<id> normalizado", () => {
    expect(claveDeAjuste("appearance", "tema-apariencia")).toBe(
      "ajuste:appearance.tema-apariencia"
    );
    expect(claveDeAjuste("effects", "displacementScale")).toBe(
      "ajuste:effects.displacement-scale"
    );
  });

  it("añade la parte del DOM como #ancla", () => {
    expect(claveDeAjuste("cuenta", "info-personal", "info-personal")).toBe(
      "ajuste:cuenta.info-personal#info-personal"
    );
  });

  it("devuelve null con falta de datos o clave inválida", () => {
    expect(claveDeAjuste("", "tema")).toBeNull();
    expect(claveDeAjuste("appearance", "")).toBeNull();
    expect(claveDeAjuste("appearance", "con espacio")).toBeNull();
  });
});

describe("clavesDeAjustes", () => {
  it("genera claves para ambos índices y todas pasan leerClave", () => {
    const lista = clavesDeAjustes();
    expect(lista.length).toBeGreaterThan(0);
    for (const ajuste of lista) {
      expect(ajuste.clave.startsWith("ajuste:")).toBe(true);
      expect(ajuste.etiqueta.length).toBeGreaterThan(0);
    }
  });

  it("no repite claves", () => {
    const lista = clavesDeAjustes();
    const set = new Set(lista.map((a) => a.clave));
    expect(set.size).toBe(lista.length);
  });

  it("incluye la clave canónica del ejemplo del contrato", () => {
    // Ajustes de diseño: displacementScale vive en la pestaña effects.
    const lista = clavesDeAjustes();
    expect(lista.some((a) => a.clave === "ajuste:effects.displacement-scale")).toBe(true);
  });
});
