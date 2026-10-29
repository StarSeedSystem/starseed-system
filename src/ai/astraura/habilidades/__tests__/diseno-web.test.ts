import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { describe, it, expect } from "vitest";
import {
  HABILIDADES_DISENO_WEB,
  MAX_PALABRAS_RESUMEN,
  MAX_PALABRAS_TARJETA,
  comoCapacidadDiseno,
  contarPalabras,
} from "../diseno-web";
import { SKILL_CAPABILITIES } from "../../skills";

// Las rutas del encargo son relativas a la raíz del repositorio (donde corre vitest).
const RAIZ = process.cwd();
const leer = (ruta: string) => readFileSync(resolve(RAIZ, ruta), "utf8");

const ENTRADAS = Object.entries(HABILIDADES_DISENO_WEB);
const TITULARES: Record<string, string> = {
  taste: "Leonxlnx",
  slides: "Zara Zhang",
  designmd: "VoltAgent",
};

describe("HABILIDADES_DISENO_WEB", () => {
  it("trae las tres habilidades con su id y su ruta", () => {
    expect(ENTRADAS.map(([clave]) => clave)).toEqual(["taste", "slides", "designmd"]);
    expect(ENTRADAS.map(([, h]) => h.id)).toEqual([
      "design-taste-frontend",
      "frontend-slides",
      "awesome-design-md",
    ]);
  });

  it.each(ENTRADAS)("%s respeta los límites de palabras (60 y 120)", (_clave, h) => {
    expect(MAX_PALABRAS_TARJETA).toBe(60);
    expect(MAX_PALABRAS_RESUMEN).toBe(120);
    const tarjeta = contarPalabras(h.tarjeta);
    const resumen = contarPalabras(h.resumen);
    expect(tarjeta).toBeGreaterThan(30);
    expect(tarjeta).toBeLessThanOrEqual(MAX_PALABRAS_TARJETA);
    expect(resumen).toBeGreaterThan(tarjeta);
    expect(resumen).toBeLessThanOrEqual(MAX_PALABRAS_RESUMEN);
  });

  it.each(ENTRADAS)("%s dice cuándo aplica en una sola frase", (_clave, h) => {
    expect(h.cuando.startsWith("Cuando ")).toBe(true);
    expect(h.cuando.endsWith(".")).toBe(true);
    expect(h.cuando.slice(0, -1)).not.toMatch(/[.!?]\s/);
  });

  it.each(ENTRADAS)("%s apunta al SKILL.md de su copia vendor", (_clave, h) => {
    expect(isAbsolute(h.rutaCompleta)).toBe(false);
    expect(existsSync(resolve(RAIZ, h.rutaCompleta))).toBe(true);
    const nombre = /^---\n[\s\S]*?^name:\s*(\S+)\s*$/m.exec(leer(h.rutaCompleta));
    expect(nombre?.[1]).toBe(h.id);
  });

  it.each(ENTRADAS)("%s cita la licencia MIT y su titular", (clave, h) => {
    expect(h.licencia).toBe("MIT");
    expect(h.autor.trim().length).toBeGreaterThan(0);
    const licencia = leer(resolve(RAIZ, h.rutaCompleta, "..", "LICENSE"));
    expect(licencia).toContain("MIT License");
    expect(licencia).toContain(TITULARES[clave]);
  });

  it.each(ENTRADAS)("%s no lleva rutas absolutas ni direcciones", (_clave, h) => {
    const textos = [h.cuando, h.tarjeta, h.resumen];
    for (const t of textos) expect(t).not.toMatch(/\/Users\/|\/home\/|https?:\/\/|\b\d{1,3}(\.\d{1,3}){3}\b/);
  });
});

describe("comoCapacidadDiseno", () => {
  it.each(ENTRADAS)("%s se adapta al registro con el tamaño pedido", (_clave, h) => {
    const resumen = comoCapacidadDiseno(h, "resumen");
    expect(resumen).toEqual({
      id: h.id,
      label: h.nombre,
      systemPrompt: `${h.resumen} (${h.autor}, MIT)`,
    });
    const tarjeta = comoCapacidadDiseno(h, "tarjeta");
    expect(tarjeta.systemPrompt).toBe(`${h.tarjeta} (${h.autor}, MIT)`);
    expect(tarjeta.systemPrompt).toContain(h.autor);
    expect(tarjeta.systemPrompt).toContain("MIT");
  });
});

describe("SKILL_CAPABILITIES · diseño web", () => {
  it("contiene taste, slides y design-md con ids únicos", () => {
    const ids = SKILL_CAPABILITIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ["taste", "slides", "design-md"]) expect(ids).toContain(id);
  });

  it("taste conserva aurora-taste y el paquete iatool-taste-skill", () => {
    const taste = SKILL_CAPABILITIES.find((c) => c.id === "taste");
    expect(taste?.skillIds).toContain("aurora-taste");
    expect(taste?.skillIds).toContain("design-taste-frontend");
    expect(taste?.packageIds).toContain("iatool-taste-skill");
    expect(taste?.routing?.preferStrong).toBe(true);
  });

  it("slides y design-md están encendidas por defecto y citan su guía", () => {
    for (const [id, h] of [
      ["slides", HABILIDADES_DISENO_WEB.slides],
      ["design-md", HABILIDADES_DISENO_WEB.designmd],
    ] as const) {
      const cap = SKILL_CAPABILITIES.find((c) => c.id === id);
      expect(cap?.defaultOn).toBe(true);
      expect(cap?.routing?.preferStrong).toBe(true);
      expect(cap?.skillIds).toEqual([h.id]);
      expect(cap?.systemPrompt).toContain(h.resumen);
      expect(cap?.systemPrompt).toContain(h.rutaCompleta);
      expect(cap?.systemPrompt).toContain("MIT");
    }
  });
});
