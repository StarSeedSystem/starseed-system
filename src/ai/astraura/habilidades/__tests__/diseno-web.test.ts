import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { describe, it, expect } from "vitest";
import {
  HABILIDADES_DISENO_WEB,
  comoCapacidadDiseno,
} from "../diseno-web";
import { SKILL_CAPABILITIES } from "../../skills";
import {
  MAX_PALABRAS_RESUMEN,
  MAX_PALABRAS_TARJETA,
  contarPalabras,
} from "../diagramas";

// Las rutas del encargo son relativas a la raíz del repositorio (donde corre vitest).
const RAIZ = process.cwd();
const leer = (ruta: string) => readFileSync(resolve(RAIZ, ruta), "utf8");

const CLAVES = ["taste", "slides", "designmd"] as const;
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
      expect(tarjeta).toBeGreaterThanOrEqual(30);
      expect(tarjeta).toBeLessThanOrEqual(MAX_PALABRAS_TARJETA);
      expect(resumen).toBeGreaterThan(tarjeta);
      expect(resumen).toBeLessThanOrEqual(MAX_PALABRAS_RESUMEN);
    }
  });

  it.each(CLAVES)("%s dice cuándo aplica en una sola frase", (clave) => {
    const h = HABILIDADES_DISENO_WEB[clave];
    expect(h.cuando.startsWith("Cuando ")).toBe(true);
    expect(h.cuando.endsWith(".")).toBe(true);
    expect(h.cuando.slice(0, -1)).not.toMatch(/[.!?]\s/);
  });

  it.each(CLAVES)("%s apunta a su SKILL.md y el name del front matter coincide", (clave) => {
    const h = HABILIDADES_DISENO_WEB[clave];
    expect(isAbsolute(h.rutaCompleta)).toBe(false);
    expect(h.rutaCompleta).toBe(`vendor/habilidades/${h.id}/SKILL.md`);
    expect(existsSync(resolve(RAIZ, h.rutaCompleta))).toBe(true);
    const nombre = /^---\n[\s\S]*?^name:\s*(\S+)\s*$/m.exec(leer(h.rutaCompleta));
    expect(nombre?.[1]).toBe(h.id);
  });

  it.each(CLAVES)("%s es MIT y su LICENSE nombra al titular", (clave) => {
    const h = HABILIDADES_DISENO_WEB[clave];
    expect(h.licencia).toBe("MIT");
    const licencia = leer(`vendor/habilidades/${h.id}/LICENSE`);
    expect(licencia).toContain("MIT License");
    expect(licencia).toContain(TITULARES[clave]);
  });

  it("ningún texto lleva rutas absolutas ni direcciones", () => {
    for (const clave of CLAVES) {
      const h = HABILIDADES_DISENO_WEB[clave];
      for (const t of [h.cuando, h.tarjeta, h.resumen]) {
        expect(t).not.toMatch(/\/Users\/|\/home\/|https?:\/\/|\b\d{1,3}(\.\d{1,3}){3}\b/);
      }
    }
  });
});

describe("comoCapacidadDiseno", () => {
  it.each(CLAVES)("%s devuelve id, label y su atribución", (clave) => {
    const h = HABILIDADES_DISENO_WEB[clave];
    const tarjeta = comoCapacidadDiseno(h, "tarjeta");
    expect(tarjeta).toEqual({
      id: h.id,
      label: h.nombre,
      systemPrompt: `${h.tarjeta} (${h.autor}, MIT)`,
    });
    const resumen = comoCapacidadDiseno(h, "resumen");
    expect(resumen.systemPrompt).toContain(h.autor);
    expect(resumen.systemPrompt.endsWith(`(${h.autor}, MIT)`)).toBe(true);
  });
});

describe("SKILL_CAPABILITIES · diseño web", () => {
  const buscar = (id: string) => SKILL_CAPABILITIES.find((c) => c.id === id);

  it("trae taste, slides y design-md entre ids únicos", () => {
    const ids = SKILL_CAPABILITIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("taste");
    expect(ids).toContain("slides");
    expect(ids).toContain("design-md");
  });

  it("taste conserva aurora-taste y iatool-taste-skill y añade la skill", () => {
    const taste = buscar("taste");
    expect(taste?.skillIds).toContain("aurora-taste");
    expect(taste?.packageIds).toContain("iatool-taste-skill");
    expect(taste?.skillIds).toContain("design-taste-frontend");
    expect(taste?.defaultOn).toBeUndefined();
  });

  it("slides y design-md están encendidas por defecto y con su ruta", () => {
    for (const [id, clave] of [["slides", "slides"], ["design-md", "designmd"]] as const) {
      const cap = buscar(id);
      const h = HABILIDADES_DISENO_WEB[clave];
      expect(cap?.defaultOn).toBe(true);
      expect(cap?.routing).toEqual({ preferStrong: true });
      expect(cap?.skillIds).toEqual([h.id]);
      expect(cap?.systemPrompt).toContain(h.resumen);
      expect(cap?.systemPrompt).toContain(h.rutaCompleta);
    }
  });
});
