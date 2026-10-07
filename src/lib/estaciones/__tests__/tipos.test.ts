import { describe, it, expect } from "vitest";
import { validarEstacion, normalizarCategorias, TIPOS_ESTACION, FUENTES_ESTACION, LICENCIAS_LIBRES, ETIQUETA_TIPO, ETIQUETA_LICENCIA } from "../tipos";

describe("tipos const", () => {
  it("tiene tipos y fuentes", () => {
    expect(TIPOS_ESTACION).toContain("audio");
    expect(FUENTES_ESTACION).toContain("enlace");
    expect(LICENCIAS_LIBRES).toContain("cc0");
  });
});

describe("ETIQUETA_TIPO", () => {
  it("mapea todos", () => {
    expect(ETIQUETA_TIPO.audio).toBe("Audio");
    expect(ETIQUETA_TIPO.video).toBe("Vídeo");
    expect(ETIQUETA_TIPO.xr).toBe("Realidad virtual");
  });
});

describe("ETIQUETA_LICENCIA", () => {
  it("mapea licencias", () => {
    expect(ETIQUETA_LICENCIA.cc0).toBe("CC0 · dominio público dedicado");
    expect(ETIQUETA_LICENCIA["cc-by"]).toBe("CC BY");
  });
});

describe("normalizarCategorias", () => {
  it("minúsculas trim sin repetir", () => {
    expect(normalizarCategorias("Música, Música,  Jazz ")).toEqual(["música","jazz"]);
  });
  it("array", () => {
    expect(normalizarCategorias(["A","a","B"])).toEqual(["a","b"]);
  });
  it("máx 8", () => {
    const cats = Array.from({length:12},(_,i)=>`c${i}`);
    expect(normalizarCategorias(cats)).toHaveLength(8);
  });
});

describe("validarEstacion", () => {
  const base = {
    titulo: "Estación de prueba",
    tipo: "audio" as const,
    fuente: "enlace" as const,
    enlace: "https://ejemplo.com/live",
    licencia: "cc-by" as const,
  };

  it("borrador bueno", () => {
    const r = validarEstacion(base);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.estacion.idioma).toBe("es");
      expect(r.estacion.visibilidad).toBe("publica");
      expect(r.estacion.ambito_tipo).toBe("persona");
    }
  });

  it("rechaza javascript:", () => {
    const r = validarEstacion({ ...base, enlace: "javascript:alert(1)" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores.some(e=>e.includes("https"))).toBe(true);
  });

  it("rechaza http no https para enlace", () => {
    const r = validarEstacion({ ...base, enlace: "http://ejemplo.com" });
    expect(r.ok).toBe(false);
  });

  it("rechaza //host", () => {
    const r = validarEstacion({ ...base, enlace: "//evil.com" });
    expect(r.ok).toBe(false);
  });

  it("fuente starseed exige ruta interna", () => {
    const r = validarEstacion({ ...base, fuente: "starseed", enlace: "/app/1" });
    expect(r.ok).toBe(true);
    const r2 = validarEstacion({ ...base, fuente: "starseed", enlace: "https://x" });
    expect(r2.ok).toBe(false);
  });

  it("ambito entidad sin ref", () => {
    const r = validarEstacion({ ...base, ambito_tipo: "entidad", entidad_ref: "" });
    expect(r.ok).toBe(false);
  });

  it("fechas al revés", () => {
    const r = validarEstacion({ ...base, empieza_en: "2026-01-02T00:00:00Z", termina_en: "2026-01-01T00:00:00Z" });
    expect(r.ok).toBe(false);
  });

  it("categorías raras", () => {
    const r = validarEstacion({ ...base, categorias: ["A".repeat(25)] });
    expect(r.ok).toBe(false);
  });

  it("varios errores", () => {
    const r = validarEstacion({ titulo: "a", tipo: "xxx" as any, fuente: "enlace", enlace: "http://x", licencia: "bad" as any });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores.length).toBeGreaterThan(1);
  });
});
