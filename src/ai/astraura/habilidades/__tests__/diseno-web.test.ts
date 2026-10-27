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

// Las rutas del encargo son relativas a la raíz del repositorio (donde corre vitest).
const RAIZ = process.cwd();
const leer = (ruta: string) => readFileSync(resolve(RAIZ, ruta), "utf8");

const CLAVES = ["taste", "slides", "designmd"] as const;

/** Titular que debe aparecer en el LICENSE de cada copia de vendor. */
const TITULARES: Record<(typeof CLAVES)[number], string> = {
  taste: "Leonxlnx",
  slides: "Zara Zhang",
  designmd: "VoltAgent",
};

describe("HABILIDADES_DISENO_WEB", () => {
  it("respeta los límites de palabras del encargo (60 y 120)", () => {
    expect(MAX_PALABRAS_TARJETA).toBe(60);
    expect(MAX_PALABRAS_RESUMEN).toBe(120);
    for (const clave of CLAVES) {
      const h = HABILIDADES_DISENO_WEB[clave];
      const tarjeta = contarPalabras(h.tarjeta);
      const resumen = contarPalabras(h.resumen);
      expect(tarjeta, clave).toBeGreaterThan(30);
      expect(tarjeta, clave).toBeLessThanOrEqual(MAX_PALABRAS_TARJETA);
      expect(resumen, clave).toBeLessThanOrEqual(MAX_PALABRAS_RESUMEN);
      expect(resumen, clave).toBeGreaterThan(tarjeta);
    }
  });

  it.each(CLAVES)("%s dice cuándo aplica en una sola frase", (clave) => {
    const h = HABILIDADES_DISENO_WEB[clave];
    expect(h.cuando.startsWith("Cuando ")).toBe(true);
    expect(h.cuando.endsWith(".")).toBe(true);
    expect(h.cuando.slice(0, -1)).not.toMatch(/[.!?]\s/);
  });

  it.each(CLAVES)("%s apunta al SKILL.md de la copia vendor y es el suyo", (clave) => {
    const h = HABILIDADES_DISENO_WEB[clave];
    expect(isAbsolute(h.rutaCompleta)).toBe(false);
    expect(existsSync(resolve(RAIZ, h.rutaCompleta))).toBe(true);
    const nombre = /^---\n[\s\S]*?^name:\s*(\S+)\s*$/m.exec(leer(h.rutaCompleta));
    expect(nombre?.[1]).toBe(h.id);
  });

  it.each(CLAVES)("%s cita la licencia MIT del original y su titular", (clave) => {
    const h = HABILIDADES_DISENO_WEB[clave];
    expect(h.licencia).toBe("MIT");
    const licencia = leer(h.rutaCompleta.replace(/\/SKILL\.md$/, "/LICENSE"));
    expect(licencia).toContain("MIT License");
    expect(licencia).toContain(TITULARES[clave]);
  });

  it("las atribuciones citan al autor, el repo y la licencia MIT", () => {
    expect(ATRIBUCION_TASTE).toContain("Leonxlnx");
    expect(ATRIBUCION_SLIDES).toContain("Zara Zhang");
    expect(ATRIBUCION_DESIGN_MD).toContain("VoltAgent");
    for (const a of [ATRIBUCION_TASTE, ATRIBUCION_SLIDES, ATRIBUCION_DESIGN_MD]) {
      expect(a).toContain("MIT");
    }
  });

  it("ningún texto lleva rutas absolutas ni direcciones", () => {
    for (const clave of CLAVES) {
      const h = HABILIDADES_DISENO_WEB[clave];
      const textos = [h.nombre, h.cuando, h.tarjeta, h.resumen, h.autor];
      for (const t of textos) expect(t).not.toMatch(/\/Users\/|\/home\/|https?:\/\/|\b\d{1,3}(\.\d{1,3}){3}\b/);
    }
  });
});

describe("comoCapacidadDiseno", () => {
  it("adapta a la forma del registro con el tamaño pedido y la atribución", () => {
    for (const clave of CLAVES) {
      const h = HABILIDADES_DISENO_WEB[clave];
      expect(comoCapacidadDiseno(h, "tarjeta")).toEqual({
        id: h.id,
        label: h.nombre,
        systemPrompt: `${h.tarjeta} (${h.autor}, ${h.licencia})`,
      });
      expect(comoCapacidadDiseno(h, "resumen").systemPrompt.endsWith(`(${h.autor}, ${h.licencia})`)).toBe(true);
    }
  });
});

describe("SKILL_CAPABILITIES · diseño web", () => {
  const porId = (id: string) => SKILL_CAPABILITIES.find((c) => c.id === id);

  it("contiene taste, slides y design-md con ids únicos", () => {
    const ids = SKILL_CAPABILITIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ["taste", "slides", "design-md"]) expect(porId(id), id).toBeDefined();
  });

  it("taste conserva aurora-taste e iatool-taste-skill y añade la skill nueva", () => {
    const taste = porId("taste");
    expect(taste?.skillIds).toContain("aurora-taste");
    expect(taste?.skillIds).toContain("design-taste-frontend");
    expect(taste?.packageIds).toContain("iatool-taste-skill");
    expect(taste?.systemPrompt).toContain(HABILIDADES_DISENO_WEB.taste.resumen);
    expect(taste?.systemPrompt).toContain(HABILIDADES_DISENO_WEB.taste.rutaCompleta);
  });

  it("slides y design-md están defaultOn, con su skill y su resumen", () => {
    for (const [id, clave] of [["slides", "slides"], ["design-md", "designmd"]] as const) {
      const c = porId(id);
      expect(c?.defaultOn, id).toBe(true);
      expect(c?.routing?.preferStrong, id).toBe(true);
      expect(c?.systemPrompt, id).toContain(HABILIDADES_DISENO_WEB[clave].resumen);
      expect(c?.systemPrompt, id).toContain(HABILIDADES_DISENO_WEB[clave].rutaCompleta);
      expect(c?.skillIds, id).toEqual([HABILIDADES_DISENO_WEB[clave].id]);
    }
  });
});
