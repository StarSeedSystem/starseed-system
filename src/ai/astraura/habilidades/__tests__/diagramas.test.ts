import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { describe, it, expect } from "vitest";
import {
  ATRIBUCION_DIAGRAMAS,
  HABILIDAD_DIAGRAMAS,
  MAX_PALABRAS_RESUMEN,
  MAX_PALABRAS_TARJETA,
  TIPOS_DIAGRAMA,
  comoCapacidad,
  contarPalabras,
  preguntaTipo,
} from "../diagramas";

// Las rutas del encargo son relativas a la raíz del repositorio (donde corre vitest).
const RAIZ = process.cwd();
const leer = (ruta: string) => readFileSync(resolve(RAIZ, ruta), "utf8");

describe("contarPalabras", () => {
  it("cuenta trozos separados por cualquier espacio, también símbolos", () => {
    expect(contarPalabras("")).toBe(0);
    expect(contarPalabras("  uno  dos\ntres ")).toBe(3);
    expect(contarPalabras("9 nodos, 12 flechas")).toBe(4);
  });
});

describe("HABILIDAD_DIAGRAMAS", () => {
  const h = HABILIDAD_DIAGRAMAS;

  it("respeta los límites de palabras del encargo (60 y 120)", () => {
    expect(MAX_PALABRAS_TARJETA).toBe(60);
    expect(MAX_PALABRAS_RESUMEN).toBe(120);
    const tarjeta = contarPalabras(h.tarjeta);
    const resumen = contarPalabras(h.resumen);
    expect(tarjeta).toBeGreaterThan(30);
    expect(tarjeta).toBeLessThanOrEqual(MAX_PALABRAS_TARJETA);
    expect(resumen).toBeLessThanOrEqual(MAX_PALABRAS_RESUMEN);
    expect(resumen).toBeGreaterThan(tarjeta);
  });

  it("dice cuándo aplica en una sola frase", () => {
    expect(h.cuando.startsWith("Cuando ")).toBe(true);
    expect(h.cuando.endsWith(".")).toBe(true);
    expect(h.cuando.slice(0, -1)).not.toMatch(/[.!?]\s/);
  });

  it("apunta al SKILL.md de la copia vendor y es el suyo", () => {
    expect(isAbsolute(h.rutaCompleta)).toBe(false);
    expect(h.rutaCompleta).toBe("vendor/habilidades/diagram-design/SKILL.md");
    expect(existsSync(resolve(RAIZ, h.rutaCompleta))).toBe(true);
    const nombre = /^---\n[\s\S]*?^name:\s*(\S+)\s*$/m.exec(leer(h.rutaCompleta));
    expect(nombre?.[1]).toBe(h.id);
  });

  it("cita la licencia MIT del original y está junto a la copia", () => {
    expect(h.licencia).toBe("MIT");
    expect(h.autor).toBe("Diagram Design");
    const licencia = leer("vendor/habilidades/diagram-design/LICENSE");
    expect(licencia).toContain("MIT License");
    expect(licencia).toContain("Cathryn Lavery");
    expect(ATRIBUCION_DIAGRAMAS).toContain("MIT");
    expect(ATRIBUCION_DIAGRAMAS).toContain("cathrynlavery");
  });

  it("ningún texto lleva rutas absolutas ni direcciones", () => {
    const textos = [h.cuando, h.tarjeta, h.resumen, ...TIPOS_DIAGRAMA.map((t) => t.frase)];
    for (const t of textos) expect(t).not.toMatch(/\/Users\/|\/home\/|https?:\/\/|\b\d{1,3}(\.\d{1,3}){3}\b/);
  });
});

describe("TIPOS_DIAGRAMA", () => {
  it("trae los 45 tipos, únicos y con su frase", () => {
    expect(TIPOS_DIAGRAMA).toHaveLength(45);
    const ids = TIPOS_DIAGRAMA.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of TIPOS_DIAGRAMA) {
      expect(t.nombre.trim().length).toBeGreaterThan(0);
      expect(contarPalabras(t.frase)).toBeGreaterThan(6);
    }
  });

  it.each(TIPOS_DIAGRAMA)("$id apunta a su guía type-*.md y sale de su «Best for»", (t) => {
    const ruta = `vendor/habilidades/diagram-design/references/type-${t.id}.md`;
    expect(existsSync(resolve(RAIZ, ruta))).toBe(true);
    expect(leer(ruta)).toContain("Best for");
  });
});

describe("preguntaTipo", () => {
  it("arma la pregunta choice de Laya con los 45 tipos", () => {
    const p = preguntaTipo();
    expect(p.type).toBe("choice");
    expect(p.instructions).toContain("tipo de diagrama");
    expect(Object.keys(p.criteria)).toEqual(TIPOS_DIAGRAMA.map((t) => t.id));
  });

  it.each([TIPOS_DIAGRAMA[0], TIPOS_DIAGRAMA[44]])("cada opción es «nombre: frase» (%s)", (t) => {
    const p = preguntaTipo();
    expect(p.criteria[t.id]).toBe(`${t.nombre}: ${t.frase}`);
  });

  it("limita las opciones al subconjunto pedido y descarta ids ajenos", () => {
    const p = preguntaTipo(["architecture", "gantt", "no-existe"]);
    expect(Object.keys(p.criteria)).toEqual(["architecture", "gantt"]);
    expect(Object.keys(preguntaTipo([]).criteria).length).toBe(45);
  });
});

describe("comoCapacidad", () => {
  it("adapta a la forma del registro con el tamaño pedido y la atribución", () => {
    const tarjeta = comoCapacidad(HABILIDAD_DIAGRAMAS, "tarjeta");
    expect(tarjeta).toEqual({
      id: "diagram-design",
      label: HABILIDAD_DIAGRAMAS.nombre,
      systemPrompt: `${HABILIDAD_DIAGRAMAS.tarjeta} (Diagram Design, MIT)`,
    });
    const resumen = comoCapacidad(HABILIDAD_DIAGRAMAS, "resumen");
    expect(resumen.systemPrompt.endsWith("(Diagram Design, MIT)")).toBe(true);
  });
});
