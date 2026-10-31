import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { SKILL_CAPABILITIES } from "@/ai/astraura/skills";
import {
  ATRIBUCIONES_DISENO_WEB,
  HABILIDADES_DISENO_WEB,
  MAX_PALABRAS_RESUMEN,
  MAX_PALABRAS_TARJETA,
  comoCapacidadDiseno,
  contarPalabras,
  type HabilidadDisenoWeb,
} from "../diseno-web";

// Las rutas del encargo son relativas a la raíz del repositorio (donde corre vitest).
const RAIZ = process.cwd();
const leer = (ruta: string) => readFileSync(resolve(RAIZ, ruta), "utf8");
type Clave = "taste" | "slides" | "designmd";
const CLAVES: Clave[] = ["taste", "slides", "designmd"];
/** Titular de la licencia de cada copia vendor, según la ficha del catálogo. */
const TITULAR: Record<Clave, string> = {
  taste: "Leonxlnx",
  slides: "Zara Zhang",
  designmd: "VoltAgent",
};

describe("contarPalabras (reexportada de diagramas)", () => {
  it("cuenta trozos separados por cualquier espacio", () => {
    expect(contarPalabras("")).toBe(0);
    expect(contarPalabras("  uno  dos\ntres ")).toBe(3);
  });
});

describe("HABILIDADES_DISENO_WEB", () => {
  it.each(CLAVES)("$id respeta los límites de palabras del encargo (60 y 120)", (clave) => {
    expect(MAX_PALABRAS_TARJETA).toBe(60);
    expect(MAX_PALABRAS_RESUMEN).toBe(120);
    const h: HabilidadDisenoWeb = HABILIDADES_DISENO_WEB[clave];
    const tarjeta = contarPalabras(h.tarjeta);
    const resumen = contarPalabras(h.resumen);
    expect(tarjeta).toBeGreaterThan(30);
    expect(tarjeta).toBeLessThanOrEqual(MAX_PALABRAS_TARJETA);
    expect(resumen).toBeLessThanOrEqual(MAX_PALABRAS_RESUMEN);
    expect(resumen).toBeGreaterThan(tarjeta);
  });

  it.each(CLAVES)("$id dice cuándo aplica en una sola frase", (clave) => {
    const h = HABILIDADES_DISENO_WEB[clave];
    expect(h.cuando.startsWith("Cuando ")).toBe(true);
    expect(h.cuando.endsWith(".")).toBe(true);
    expect(h.cuando.slice(0, -1)).not.toMatch(/[.!?]\s/);
  });

  it.each(CLAVES)("$id apunta al SKILL.md de la copia vendor y es el suyo", (clave) => {
    const h = HABILIDADES_DISENO_WEB[clave];
    expect(isAbsolute(h.rutaCompleta)).toBe(false);
    expect(existsSync(resolve(RAIZ, h.rutaCompleta))).toBe(true);
    const nombre = /^---\n[\s\S]*?^name:\s*(\S+)\s*$/m.exec(leer(h.rutaCompleta));
    expect(nombre?.[1]).toBe(h.id);
  });

  it.each(CLAVES)("$id cita la licencia MIT del original y está junto a la copia", (clave) => {
    const h = HABILIDADES_DISENO_WEB[clave];
    const carpeta = h.rutaCompleta.split("/").slice(0, 3).join("/");
    expect(h.licencia).toBe("MIT");
    const licencia = leer(`${carpeta}/LICENSE`);
    expect(licencia).toContain("MIT License");
    expect(licencia).toContain(TITULAR[clave]);
    expect(ATRIBUCIONES_DISENO_WEB[clave]).toContain("MIT");
  });

  it.each(CLAVES)("$id no lleva rutas absolutas ni direcciones en sus textos", (clave) => {
    const h = HABILIDADES_DISENO_WEB[clave];
    for (const t of [h.cuando, h.tarjeta, h.resumen]) {
      expect(t).not.toMatch(/\/Users\/|\/home\/|https?:\/\/|\b\d{1,3}(\.\d{1,3}){3}\b/);
    }
  });
});

describe("comoCapacidadDiseno", () => {
  it("adapta a la forma del registro con el tamaño pedido, autor y licencia", () => {
    const h = HABILIDADES_DISENO_WEB.taste;
    const tarjeta = comoCapacidadDiseno(h, "tarjeta");
    expect(tarjeta.id).toBe(h.id);
    expect(tarjeta.label).toBe(h.nombre);
    expect(tarjeta.systemPrompt).toBe(`${h.tarjeta} (${h.autor}, ${h.licencia})`);
    const resumen = comoCapacidadDiseno(h, "resumen");
    expect(resumen.systemPrompt.startsWith(h.resumen)).toBe(true);
    expect(resumen.systemPrompt).toContain(h.autor);
    expect(resumen.systemPrompt).toContain("MIT");
  });
});

describe("SKILL_CAPABILITIES", () => {
  it("contiene taste, slides y design-md y todos los ids son únicos", () => {
    const ids = SKILL_CAPABILITIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ["taste", "slides", "design-md"]) expect(ids).toContain(id);
  });

  it("taste conserva aurora-taste e iatool-taste-skill y añade design-taste-frontend", () => {
    const taste = SKILL_CAPABILITIES.find((c) => c.id === "taste");
    expect(taste?.skillIds).toContain("aurora-taste");
    expect(taste?.skillIds).toContain("design-taste-frontend");
    expect(taste?.packageIds).toContain("iatool-taste-skill");
    expect(taste?.systemPrompt).toContain(HABILIDADES_DISENO_WEB.taste.resumen);
    expect(taste?.systemPrompt).toContain(HABILIDADES_DISENO_WEB.taste.rutaCompleta);
    expect(taste?.systemPrompt).toContain("ADN del contexto");
  });

  it.each([
    ["slides", "slides", "frontend-slides"],
    ["design-md", "designmd", "awesome-design-md"],
  ] satisfies [string, Clave, string][])(
    "%s está defaultOn con el resumen, la guía completa y su skill",
    (id, clave, skillId) => {
      const fila = SKILL_CAPABILITIES.find((c) => c.id === id);
      const h = HABILIDADES_DISENO_WEB[clave];
      expect(fila?.defaultOn).toBe(true);
      expect(fila?.id).toBe(id);
      expect(fila?.label).toBe(h.nombre);
      expect(fila?.routing?.preferStrong).toBe(true);
      expect(fila?.skillIds).toEqual([skillId]);
      expect(fila?.systemPrompt).toContain(h.resumen);
      expect(fila?.systemPrompt).toContain(`Guía completa en ${h.rutaCompleta}`);
      expect(fila?.systemPrompt).toContain(ATRIBUCIONES_DISENO_WEB[clave]);
    },
  );
});
