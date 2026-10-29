import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { describe, it, expect } from "vitest";
import {
  HABILIDADES_DISENO_WEB,
  MAX_PALABRAS_RESUMEN,
  MAX_PALABRAS_TARJETA,
  contarPalabras,
  comoCapacidadDiseno,
} from "../diseno-web";
import { SKILL_CAPABILITIES } from "../../skills";

// Las rutas del encargo son relativas a la raíz del repositorio (donde corre vitest).
const RAIZ = process.cwd();
const leer = (ruta: string) => readFileSync(resolve(RAIZ, ruta), "utf8");

// Titular real de la licencia de cada copia vendor (objetos fuera del alcance EDN).
// EDN start eliminar_marcado
const TITULAR: Record<"taste" | "slides" | "designmd", string> = {
  taste: "Leonxlnx",
  slides: "Zara Zhang",
  designmd: "VoltAgent",
};
// EDN end eliminar_marcado
const CLAVES = ["taste", "slides", "designmd"] as const;

describe("HABILIDADES_DISENO_WEB", () => {
  it("trae las tres habilidades y respeta los límites de palabras (60 y 120)", () => {
    expect(MAX_PALABRAS_TARJETA).toBe(60);
    expect(MAX_PALABRAS_RESUMEN).toBe(120);
    expect(Object.keys(HABILIDADES_DISENO_WEB)).toHaveLength(3);
    for (const clave of CLAVES) {
      const h = HABILIDADES_DISENO_WEB[clave];
      const tarjeta = contarPalabras(h.tarjeta);
      const resumen = contarPalabras(h.resumen);
      expect(tarjeta).toBeGreaterThan(30);
      expect(tarjeta).toBeLessThanOrEqual(MAX_PALABRAS_TARJETA);
      expect(resumen).toBeGreaterThan(tarjeta);
      expect(resumen).toBeLessThanOrEqual(MAX_PALABRAS_RESUMEN);
    }
  });

  it.each(CLAVES)("%s dice cuándo aplica en una sola frase", (clave) => {
    const { cuando } = HABILIDADES_DISENO_WEB[clave];
    expect(cuando.startsWith("Cuando ")).toBe(true);
    expect(cuando.endsWith(".")).toBe(true);
    expect(cuando.slice(0, -1)).not.toMatch(/[.!?]\s/);
  });

  it.each(CLAVES)("%s apunta al SKILL.md de su copia vendor y es el suyo", (clave) => {
    const h = HABILIDADES_DISENO_WEB[clave];
    expect(isAbsolute(h.rutaCompleta)).toBe(false);
    expect(existsSync(resolve(RAIZ, h.rutaCompleta))).toBe(true);
    const nombre = /^---\n[\s\S]*?^name:\s*(\S+)\s*$/m.exec(leer(h.rutaCompleta));
    expect(nombre?.[1]).toBe(h.id);
  });

  it.each(CLAVES)("%s cita la licencia MIT del original y está junto a la copia", (clave) => {
    const h = HABILIDADES_DISENO_WEB[clave];
    expect(h.licencia).toBe("MIT");
    const licencia = leer(resolve(RAIZ, h.rutaCompleta).replace(/SKILL\.md$/, "LICENSE"));
    expect(licencia).toContain("MIT License");
    expect(licencia).toContain(TITULAR[clave]);
  });

  it("ningún texto de tarjeta o resumen lleva rutas absolutas", () => {
    for (const clave of CLAVES) {
      const { tarjeta, resumen, cuando } = HABILIDADES_DISENO_WEB[clave];
      for (const t of [tarjeta, resumen, cuando]) expect(t).not.toMatch(/\/Users\/|\/home\//);
    }
  });
});

describe("comoCapacidadDiseno", () => {
  it.each(CLAVES)("%s adapta a la forma del registro con autor y licencia", (clave) => {
    const h = HABILIDADES_DISENO_WEB[clave];
    const tarjeta = comoCapacidadDiseno(h, "tarjeta");
    expect(tarjeta).toEqual({
      id: h.id,
      label: h.nombre,
      systemPrompt: `${h.tarjeta} (${h.autor}, ${h.licencia})`,
    });
    const resumen = comoCapacidadDiseno(h, "resumen");
    expect(resumen.systemPrompt.startsWith(h.resumen)).toBe(true);
    expect(resumen.systemPrompt).toContain(h.autor);
    expect(resumen.systemPrompt).toContain(h.licencia);
  });
});

describe("capacidades de diseño web en el registro de Astraura", () => {
  const porId = new Map(SKILL_CAPABILITIES.map((c) => [c.id, c]));

  it("registra taste, slides y design-md con ids únicos", () => {
    const ids = SKILL_CAPABILITIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(porId.has("taste")).toBe(true);
    expect(porId.has("slides")).toBe(true);
    expect(porId.has("design-md")).toBe(true);
  });

  it("taste conserva aurora-taste y iatool-taste-skill y lleva el resumen nuevo", () => {
    const taste = porId.get("taste");
    expect(taste?.skillIds).toContain("aurora-taste");
    expect(taste?.skillIds).toContain("design-taste-frontend");
    expect(taste?.packageIds).toContain("iatool-taste-skill");
    expect(taste?.systemPrompt).toContain(HABILIDADES_DISENO_WEB.taste.resumen);
    expect(taste?.systemPrompt).toContain(HABILIDADES_DISENO_WEB.taste.rutaCompleta);
    expect(taste?.systemPrompt).toContain("el ADN del contexto");
  });

  it("slides y design-md están encendidas por defecto con su resumen y guía", () => {
    for (const [id, clave] of [
      ["slides", "slides"],
      ["design-md", "designmd"],
    ] as const) {
      const c = porId.get(id);
      expect(c?.defaultOn).toBe(true);
      expect(c?.routing?.preferStrong).toBe(true);
      expect(c?.systemPrompt).toContain(HABILIDADES_DISENO_WEB[clave].resumen);
      expect(c?.systemPrompt).toContain(HABILIDADES_DISENO_WEB[clave].rutaCompleta);
      expect(c?.systemPrompt).toContain("licencia MIT");
    }
    expect(porId.get("slides")?.skillIds).toEqual(["frontend-slides"]);
    expect(porId.get("design-md")?.skillIds).toEqual(["awesome-design-md"]);
  });
});
