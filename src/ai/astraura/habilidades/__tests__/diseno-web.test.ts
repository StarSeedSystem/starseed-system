// @vitest-environment jsdom
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

/** Titular que debe aparecer en el LICENSE de cada copia vendor. */
const TITULARES: Record<string, string> = {
  "design-taste-frontend": "Leonxlnx",
  "frontend-slides": "Zara Zhang",
  "awesome-design-md": "VoltAgent",
};

describe("HABILIDADES_DISENO_WEB", () => {
  it.each(ENTRADAS)("%s respeta los límites de palabras (30–60 y ≤ 120)", (_clave, h) => {
    expect(MAX_PALABRAS_TARJETA).toBe(60);
    expect(MAX_PALABRAS_RESUMEN).toBe(120);
    const tarjeta = contarPalabras(h.tarjeta);
    const resumen = contarPalabras(h.resumen);
    expect(tarjeta).toBeGreaterThanOrEqual(30);
    expect(tarjeta).toBeLessThanOrEqual(MAX_PALABRAS_TARJETA);
    expect(resumen).toBeGreaterThan(tarjeta);
    expect(resumen).toBeLessThanOrEqual(MAX_PALABRAS_RESUMEN);
  });

  it.each(ENTRADAS)("%s dice cuándo aplica en una sola frase", (_clave, h) => {
    expect(h.cuando.startsWith("Cuando ")).toBe(true);
    expect(h.cuando.endsWith(".")).toBe(true);
    expect(h.cuando.slice(0, -1)).not.toMatch(/[.!?]\s/);
  });

  it.each(ENTRADAS)("%s apunta a su SKILL.md de vendor y el front matter coincide", (_clave, h) => {
    expect(isAbsolute(h.rutaCompleta)).toBe(false);
    expect(existsSync(resolve(RAIZ, h.rutaCompleta))).toBe(true);
    const nombre = /^---\n[\s\S]*?^name:\s*(\S+)\s*$/m.exec(leer(h.rutaCompleta));
    expect(nombre?.[1]).toBe(h.id);
  });

  it.each(ENTRADAS)("%s cita la licencia MIT y el titular de su copia", (_clave, h) => {
    expect(h.licencia).toBe("MIT");
    const carpeta = h.rutaCompleta.replace(/\/SKILL\.md$/, "");
    const licencia = leer(`${carpeta}/LICENSE`);
    expect(licencia).toContain("MIT License");
    expect(licencia).toContain(TITULARES[h.id]);
  });
});

describe("comoCapacidadDiseno", () => {
  it.each(ENTRADAS)("%s se adapta al registro con el tamaño pedido", (_clave, h) => {
    const tarjeta = comoCapacidadDiseno(h, "tarjeta");
    expect(tarjeta.id).toBe(h.id);
    expect(tarjeta.label).toBe(h.nombre);
    expect(tarjeta.systemPrompt).toBe(`${h.tarjeta} (${h.autor}, ${h.licencia})`);
    expect(tarjeta.systemPrompt).toContain(h.autor);
    expect(tarjeta.systemPrompt).toContain(h.licencia);
    const resumen = comoCapacidadDiseno(h, "resumen");
    expect(resumen.systemPrompt).toBe(`${h.resumen} (${h.autor}, ${h.licencia})`);
    expect(resumen.systemPrompt.endsWith(`(${h.autor}, MIT)`)).toBe(true);
  });
});

describe("SKILL_CAPABILITIES", () => {
  it("trae taste, slides y design-md con ids únicos", () => {
    const ids = SKILL_CAPABILITIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ["taste", "slides", "design-md"]) expect(ids).toContain(id);
  });

  it("taste conserva sus skills y paquetes y añade la de Taste", () => {
    const taste = SKILL_CAPABILITIES.find((c) => c.id === "taste");
    expect(taste?.skillIds).toContain("aurora-taste");
    expect(taste?.skillIds).toContain("design-taste-frontend");
    expect(taste?.packageIds).toContain("iatool-taste-skill");
    expect(taste?.systemPrompt).toContain(HABILIDADES_DISENO_WEB.taste.resumen);
    expect(taste?.systemPrompt).toContain(HABILIDADES_DISENO_WEB.taste.rutaCompleta);
  });

  it("slides y design-md están encendidas por defecto y cuelgan de su skill", () => {
    const slides = SKILL_CAPABILITIES.find((c) => c.id === "slides");
    const designmd = SKILL_CAPABILITIES.find((c) => c.id === "design-md");
    expect(slides?.defaultOn).toBe(true);
    expect(slides?.skillIds).toEqual(["frontend-slides"]);
    expect(slides?.systemPrompt).toContain(HABILIDADES_DISENO_WEB.slides.rutaCompleta);
    expect(designmd?.defaultOn).toBe(true);
    expect(designmd?.skillIds).toEqual(["awesome-design-md"]);
    expect(designmd?.systemPrompt).toContain(HABILIDADES_DISENO_WEB.designmd.rutaCompleta);
  });
});
