// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { describe, it, expect } from "vitest";
import {
  HABILIDADES_DISENO_WEB,
  comoCapacidadDiseno,
} from "../diseno-web";
import {
  contarPalabras,
  MAX_PALABRAS_RESUMEN,
  MAX_PALABRAS_TARJETA,
} from "../diagramas";
import { SKILL_CAPABILITIES } from "../../skills";

// Las rutas del encargo son relativas a la raíz del repositorio (donde corre vitest).
const RAIZ = process.cwd();
const leer = (ruta: string) => readFileSync(resolve(RAIZ, ruta), "utf8");
const CLAVES = ["taste", "slides", "designmd"] as const;
const TODAS = CLAVES.map((k) => HABILIDADES_DISENO_WEB[k]);
const TITULARES: Record<(typeof CLAVES)[number], string> = {
  taste: "Leonxlnx",
  slides: "Zara Zhang",
  designmd: "VoltAgent",
};

describe("HABILIDADES_DISENO_WEB", () => {
  it("trae las tres habilidades con los ids acordados", () => {
    expect(TODAS.map((h) => h.id)).toEqual([
      "design-taste-frontend",
      "frontend-slides",
      "awesome-design-md",
    ]);
  });

  it("respeta los límites de palabras del encargo (60 y 120)", () => {
    expect(MAX_PALABRAS_TARJETA).toBe(60);
    expect(MAX_PALABRAS_RESUMEN).toBe(120);
    for (const h of TODAS) {
      const tarjeta = contarPalabras(h.tarjeta);
      const resumen = contarPalabras(h.resumen);
      expect(tarjeta, `${h.id} tarjeta`).toBeGreaterThan(30);
      expect(tarjeta, `${h.id} tarjeta`).toBeLessThanOrEqual(MAX_PALABRAS_TARJETA);
      expect(resumen, `${h.id} resumen`).toBeGreaterThan(tarjeta);
      expect(resumen, `${h.id} resumen`).toBeLessThanOrEqual(MAX_PALABRAS_RESUMEN);
    }
  });

  it("dice cuándo aplica en una sola frase", () => {
    for (const h of TODAS) {
      expect(h.cuando.startsWith("Cuando "), h.id).toBe(true);
      expect(h.cuando.endsWith("."), h.id).toBe(true);
      expect(h.cuando.slice(0, -1), h.id).not.toMatch(/[.!?]\s/);
    }
  });

  it("apunta al SKILL.md de su copia vendor y el front matter lleva su id", () => {
    for (const h of TODAS) {
      expect(isAbsolute(h.rutaCompleta), h.id).toBe(false);
      expect(existsSync(resolve(RAIZ, h.rutaCompleta)), h.id).toBe(true);
      const nombre = /^---\n[\s\S]*?^name:\s*(\S+)\s*$/m.exec(leer(h.rutaCompleta));
      expect(nombre?.[1], h.id).toBe(h.id);
    }
  });

  it("cita la licencia MIT y el titular de cada copia", () => {
    for (const clave of CLAVES) {
      const h = HABILIDADES_DISENO_WEB[clave];
      expect(h.licencia, h.id).toBe("MIT");
      const licencia = leer(h.rutaCompleta.replace(/\/SKILL\.md$/, "/LICENSE"));
      expect(licencia, h.id).toContain("MIT License");
      expect(licencia, h.id).toContain(TITULARES[clave]);
    }
  });
});

describe("comoCapacidadDiseno", () => {
  it("adapta a la forma del registro con el tamaño pedido y la atribución", () => {
    const tarjeta = comoCapacidadDiseno(HABILIDADES_DISENO_WEB.taste, "tarjeta");
    expect(tarjeta).toEqual({
      id: "design-taste-frontend",
      label: HABILIDADES_DISENO_WEB.taste.nombre,
      systemPrompt: `${HABILIDADES_DISENO_WEB.taste.tarjeta} (Taste Skill, MIT)`,
    });
    const resumen = comoCapacidadDiseno(HABILIDADES_DISENO_WEB.slides, "resumen");
    expect(resumen.systemPrompt.endsWith("(Frontend Slides, MIT)")).toBe(true);
  });
});

describe("SKILL_CAPABILITIES · diseño web", () => {
  const porId = (id: string) => SKILL_CAPABILITIES.filter((c) => c.id === id);
  const IDS_CAPACIDAD = [
    "taste",
    HABILIDADES_DISENO_WEB.slides.id,
    HABILIDADES_DISENO_WEB.designmd.id,
  ];

  it("contiene taste, slides y design-md con ids únicos", () => {
    for (const id of IDS_CAPACIDAD) expect(porId(id), id).toHaveLength(1);
    expect(new Set(IDS_CAPACIDAD).size).toBe(3);
  });

  it("taste conserva aurora-taste y iatool-taste-skill", () => {
    const taste = porId("taste")[0];
    expect(taste.skillIds).toContain("aurora-taste");
    expect(taste.packageIds).toContain("iatool-taste-skill");
  });

  it("slides y design-md están encendidas por defecto", () => {
    for (const id of ["frontend-slides", "awesome-design-md"]) {
      expect(porId(id)[0]?.defaultOn, id).toBe(true);
    }
  });
});
