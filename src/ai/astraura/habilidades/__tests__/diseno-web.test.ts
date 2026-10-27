// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { SKILL_CAPABILITIES } from "@/ai/astraura/skills";
import {
  ATRIBUCION_DESIGN_MD,
  ATRIBUCION_SLIDES,
  ATRIBUCION_TASTE,
  HABILIDADES_DISENO_WEB,
  MAX_PALABRAS_RESUMEN,
  MAX_PALABRAS_TARJETA,
  comoCapacidadDiseno,
  contarPalabras,
} from "../diseno-web";

const RAIZ = process.cwd();
const leer = (ruta: string) => readFileSync(resolve(RAIZ, ruta), "utf8");
const CLAVES = ["taste", "slides", "designmd"] as const;

const TITULARES: Record<(typeof CLAVES)[number], string> = {
  taste: "Leonxlnx",
  slides: "Zara Zhang",
  designmd: "VoltAgent",
};

describe("HABILIDADES_DISENO_WEB · tres tamaños", () => {
  it.each(CLAVES)("%s respeta los límites de palabras (60 y 120)", (clave) => {
    expect(MAX_PALABRAS_TARJETA).toBe(60);
    expect(MAX_PALABRAS_RESUMEN).toBe(120);
    const h = HABILIDADES_DISENO_WEB[clave];
    const tarjeta = contarPalabras(h.tarjeta);
    const resumen = contarPalabras(h.resumen);
    expect(tarjeta).toBeGreaterThan(30);
    expect(tarjeta).toBeLessThanOrEqual(MAX_PALABRAS_TARJETA);
    expect(resumen).toBeGreaterThan(tarjeta);
    expect(resumen).toBeLessThanOrEqual(MAX_PALABRAS_RESUMEN);
  });

  it.each(CLAVES)("%s dice cuándo aplica en una sola frase", (clave) => {
    const { cuando } = HABILIDADES_DISENO_WEB[clave];
    expect(cuando.startsWith("Cuando ")).toBe(true);
    expect(cuando.endsWith(".")).toBe(true);
    expect(cuando.slice(0, -1)).not.toMatch(/[.!?]\s/);
  });

  it.each(CLAVES)("%s apunta a su SKILL.md vendor y el front matter coincide", (clave) => {
    const h = HABILIDADES_DISENO_WEB[clave];
    expect(isAbsolute(h.rutaCompleta)).toBe(false);
    expect(existsSync(resolve(RAIZ, h.rutaCompleta))).toBe(true);
    const nombre = /^---\n[\s\S]*?^name:\s*(\S+)\s*$/m.exec(leer(h.rutaCompleta));
    expect(nombre?.[1]).toBe(h.id);
  });

  it.each(CLAVES)("%s cita su licencia MIT y el titular del original", (clave) => {
    const h = HABILIDADES_DISENO_WEB[clave];
    expect(h.licencia).toBe("MIT");
    const licencia = leer(h.rutaCompleta.replace(/SKILL\.md$/, "LICENSE"));
    expect(licencia).toContain("MIT License");
    expect(licencia).toContain(TITULARES[clave]);
  });
});

describe("comoCapacidadDiseno", () => {
  it.each(CLAVES)("%s devuelve id, label y el prompt con autor y licencia", (clave) => {
    const h = HABILIDADES_DISENO_WEB[clave];
    const capacidad = comoCapacidadDiseno(h, "resumen");
    expect(capacidad.id).toBe(h.id);
    expect(capacidad.label).toBe(h.nombre);
    expect(capacidad.systemPrompt).toBe(`${h.resumen} (${h.autor}, ${h.licencia})`);
  });

  it("usa la tarjeta cuando se pide ese tamaño", () => {
    const h = HABILIDADES_DISENO_WEB.taste;
    expect(comoCapacidadDiseno(h, "tarjeta").systemPrompt).toBe(`${h.tarjeta} (${h.autor}, ${h.licencia})`);
  });
});

describe("SKILL_CAPABILITIES · diseño web vivo", () => {
  it("no duplica ids y trae taste, slides y design-md", () => {
    const ids = SKILL_CAPABILITIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ["taste", "slides", "design-md"]) {
      expect(SKILL_CAPABILITIES.find((c) => c.id === id), id).toBeDefined();
    }
  });

  it("taste conserva aurora-taste, su paquete y gana design-taste-frontend", () => {
    const taste = SKILL_CAPABILITIES.find((c) => c.id === "taste")!;
    expect(taste.skillIds).toContain("aurora-taste");
    expect(taste.skillIds).toContain("design-taste-frontend");
    expect(taste.packageIds).toContain("iatool-taste-skill");
    expect(taste.routing?.preferStrong).toBe(true);
  });

  it("slides y design-md están encendidas por defecto y llevan su atribución", () => {
    for (const [id, atribucion] of [
      ["slides", ATRIBUCION_SLIDES],
      ["design-md", ATRIBUCION_DESIGN_MD],
    ] as const) {
      const cap = SKILL_CAPABILITIES.find((c) => c.id === id)!;
      expect(cap.defaultOn, id).toBe(true);
      expect(cap.routing?.preferStrong, id).toBe(true);
      expect(cap.systemPrompt, id).toContain(atribucion);
    }
  });

  it("las atribuciones citan la licencia MIT y su origen", () => {
    for (const [texto, origen] of [
      [ATRIBUCION_TASTE, "github.com/Leonxlnx/taste-skill"],
      [ATRIBUCION_SLIDES, "github.com/zarazhangrui/frontend-slides"],
      [ATRIBUCION_DESIGN_MD, "github.com/VoltAgent/awesome-design-md"],
    ] as const) {
      expect(texto).toContain("MIT");
      expect(texto).toContain(origen);
    }
  });
});
