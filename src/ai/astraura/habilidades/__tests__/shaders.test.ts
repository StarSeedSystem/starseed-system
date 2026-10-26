import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { describe, it, expect } from "vitest";
import {
  ATRIBUCION_SHADERS,
  HABILIDAD_SHADERS,
  MAX_PALABRAS_RESUMEN,
  MAX_PALABRAS_TARJETA,
  comoCapacidad,
  contarPalabras,
  presetDesdeRespuesta,
} from "../shaders";

const RAIZ = process.cwd();
const leer = (ruta: string) => readFileSync(resolve(RAIZ, ruta), "utf8");

describe("contarPalabras", () => {
  it("cuenta palabras", () => {
    expect(contarPalabras("")).toBe(0);
    expect(contarPalabras("uno dos tres")).toBe(3);
  });
});

describe("HABILIDAD_SHADERS", () => {
  const h = HABILIDAD_SHADERS;
  it("respeta límites de palabras", () => {
    expect(MAX_PALABRAS_TARJETA).toBe(60);
    expect(MAX_PALABRAS_RESUMEN).toBe(120);
    const tarjeta = contarPalabras(h.tarjeta);
    const resumen = contarPalabras(h.resumen);
    expect(tarjeta).toBeGreaterThan(30);
    expect(tarjeta).toBeLessThanOrEqual(MAX_PALABRAS_TARJETA);
    expect(resumen).toBeLessThanOrEqual(MAX_PALABRAS_RESUMEN);
    expect(resumen).toBeGreaterThan(tarjeta);
  });
  it("cuando en frase", () => {
    expect(h.cuando.startsWith("Cuando ")).toBe(true);
    expect(h.cuando.endsWith(".")).toBe(true);
    expect(h.cuando.slice(0, -1)).not.toMatch(/[.!?]\s/);
  });
  it("ruta relativa y existe", () => {
    expect(isAbsolute(h.rutaCompleta)).toBe(false);
    expect(h.rutaCompleta).toBe("vendor/habilidades/shaders/SKILL.md");
    expect(existsSync(resolve(RAIZ, h.rutaCompleta))).toBe(true);
  });
  it("licencia MIT y atribución", () => {
    expect(h.licencia).toBe("MIT");
    expect(h.autor).toBe("Shader Effects Inc.");
    expect(ATRIBUCION_SHADERS).toContain("MIT");
    expect(ATRIBUCION_SHADERS).toContain("shader-effects-inc");
  });
  it("sin rutas absolutas", () => {
    const textos = [h.cuando, h.tarjeta, h.resumen];
    for (const t of textos) expect(t).not.toMatch(/\/Users\/|\/home\/|https?:\/\//);
  });
});

describe("comoCapacidad", () => {
  it("mapea a SkillCapability", () => {
    const cap = comoCapacidad(HABILIDAD_SHADERS, "tarjeta");
    expect(cap.id).toBe("shaders");
    expect(cap.label).toBe(HABILIDAD_SHADERS.nombre);
    expect(cap.systemPrompt).toContain(HABILIDAD_SHADERS.tarjeta);
    expect(cap.systemPrompt).toContain("(Shader Effects Inc., MIT)");
  });
});

describe("presetDesdeRespuesta", () => {
  it("extrae JSON de bloque ```json", () => {
    const txt = "Aquí va el preset:\n```json\n{\"components\":[{\"type\":\"LinearGradient\"}]}\n```";
    const r = presetDesdeRespuesta(txt);
    expect(r.ok).toBe(true);
    expect((r as any).preset).toEqual({ components: [{ type: "LinearGradient" }] });
  });
  it("extrae JSON sin delimitadores", () => {
    const r = presetDesdeRespuesta('{"components":[]}');
    expect(r.ok).toBe(true);
  });
  it("rechaza JSON inválido", () => {
    const r = presetDesdeRespuesta("no json");
    expect(r.ok).toBe(false);
  });
  it("rechaza cámara", () => {
    const txt = '{"components":[{"type":"WebcamTexture"}]}';
    const r = presetDesdeRespuesta(txt);
    expect(r.ok).toBe(false);
    expect((r as any).motivos[0]).toContain("WebcamTexture");
  });
  it("rechaza ObjectTracker", () => {
    const txt = '{"components":[{"type":"ObjectTracker"}]}';
    const r = presetDesdeRespuesta(txt);
    expect(r.ok).toBe(false);
    expect((r as any).motivos[0]).toContain("ObjectTracker");
  });
  it("valida array directo", () => {
    const txt = '[{"type":"WebcamTexture"}]';
    const r = presetDesdeRespuesta(txt);
    expect(r.ok).toBe(false);
    expect((r as any).motivos[0]).toContain("WebcamTexture");
  });
  it("no usa regex voraz con múltiples llaves", () => {
    const txt = "Texto { no es json } y luego {\"components\":[]} correcto";
    const r = presetDesdeRespuesta(txt);
    expect(r.ok).toBe(true);
    expect((r as any).preset).toEqual({ components: [] });
  });
});
