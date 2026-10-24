import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { describe, it, expect } from "vitest";
import {
  ATRIBUCION_INGENIERIA,
  HABILIDADES_INGENIERIA_B,
  MAX_PALABRAS_RESUMEN,
  MAX_PALABRAS_TARJETA,
  comoCapacidad,
  contarPalabras,
} from "../ingenieria-b";
import { HABILIDADES_INGENIERIA_A } from "../ingenieria-a";
import { PRODUCTIVITY_SKILLS } from "../productividad";

// Las rutas del encargo son relativas a la raíz del repositorio (donde corre vitest).
const RAIZ = process.cwd();
const leer = (ruta: string) => readFileSync(resolve(RAIZ, ruta), "utf8");

describe("contarPalabras (reexportada)", () => {
  it("cuenta trozos separados por cualquier espacio, también símbolos", () => {
    expect(contarPalabras("")).toBe(0);
    expect(contarPalabras("  uno  dos\ntres ")).toBe(3);
  });
});

describe("HABILIDADES_INGENIERIA_B", () => {
  it("trae exactamente las siete habilidades del encargo, con los ids del original", () => {
    expect(HABILIDADES_INGENIERIA_B.map((h) => h.id)).toEqual([
      "to-spec",
      "to-tickets",
      "triage",
      "prototype",
      "research",
      "improve-codebase-architecture",
      "implement",
    ]);
  });

  it("tiene ids únicos, sin chocar con las de ingeniería A ni las de productividad", () => {
    const ids = HABILIDADES_INGENIERIA_B.map((h) => h.id);
    expect(new Set(ids).size).toBe(ids.length);
    const ocupados = new Set([
      ...HABILIDADES_INGENIERIA_A.map((h) => h.id),
      ...PRODUCTIVITY_SKILLS.map((c) => c.id),
    ]);
    expect(ids.filter((id) => ocupados.has(id))).toEqual([]);
  });

  it("los límites son los del encargo (60 y 120)", () => {
    expect(MAX_PALABRAS_TARJETA).toBe(60);
    expect(MAX_PALABRAS_RESUMEN).toBe(120);
  });

  it.each(HABILIDADES_INGENIERIA_B)("$id respeta los límites de palabras", (h) => {
    const tarjeta = contarPalabras(h.tarjeta);
    const resumen = contarPalabras(h.resumen);
    expect(tarjeta).toBeGreaterThan(20);
    expect(tarjeta).toBeLessThanOrEqual(MAX_PALABRAS_TARJETA);
    expect(resumen).toBeLessThanOrEqual(MAX_PALABRAS_RESUMEN);
    expect(resumen).toBeGreaterThan(tarjeta);
  });

  it.each(HABILIDADES_INGENIERIA_B)("$id dice cuándo aplica en una sola frase", (h) => {
    expect(h.nombre.trim().length).toBeGreaterThan(0);
    expect(h.cuando.startsWith("Cuando ")).toBe(true);
    expect(h.cuando.endsWith(".")).toBe(true);
    expect(h.cuando.slice(0, -1)).not.toMatch(/[.!?]\s/);
  });

  it.each(HABILIDADES_INGENIERIA_B)("$id apunta a un SKILL.md que existe y es el suyo", (h) => {
    expect(isAbsolute(h.rutaCompleta)).toBe(false);
    expect(h.rutaCompleta).toBe(
      `vendor/habilidades/mattpocock-skills/engineering/${h.id}/SKILL.md`,
    );
    expect(existsSync(resolve(RAIZ, h.rutaCompleta))).toBe(true);
    // El `name` del encabezado del original coincide con el id: no se mezclan habilidades.
    const nombre = /^---\n[\s\S]*?^name:\s*(\S+)\s*$/m.exec(leer(h.rutaCompleta));
    expect(nombre?.[1]).toBe(h.id);
  });

  it.each(HABILIDADES_INGENIERIA_B)("$id cita la licencia y el autor del original", (h) => {
    expect(h.licencia).toBe("MIT");
    expect(h.autor).toBe("Matt Pocock");
  });

  it("la licencia MIT de Matt Pocock está junto a la copia", () => {
    const licencia = leer("vendor/habilidades/mattpocock-skills/LICENSE");
    expect(licencia).toContain("MIT License");
    expect(licencia).toContain("Matt Pocock");
    expect(ATRIBUCION_INGENIERIA).toContain("Matt Pocock");
    expect(ATRIBUCION_INGENIERIA).toContain("MIT");
  });

  it("ningún texto lleva rutas absolutas ni direcciones", () => {
    const textos = HABILIDADES_INGENIERIA_B.flatMap((h) => [h.cuando, h.tarjeta, h.resumen]);
    for (const t of textos) {
      expect(t).not.toMatch(/\/Users\/|\/home\/|https?:\/\/|\b\d{1,3}(\.\d{1,3}){3}\b/);
    }
  });
});

describe("comoCapacidad (reexportada)", () => {
  const toSpec = HABILIDADES_INGENIERIA_B[0];

  it("adapta a la forma del registro con el tamaño pedido y la atribución", () => {
    const tarjeta = comoCapacidad(toSpec, "tarjeta");
    expect(tarjeta).toEqual({
      id: "to-spec",
      label: toSpec.nombre,
      systemPrompt: `${toSpec.tarjeta} (Matt Pocock, MIT)`,
    });
    const resumen = comoCapacidad(toSpec, "resumen");
    expect(resumen.systemPrompt.startsWith(toSpec.resumen)).toBe(true);
    expect(resumen.systemPrompt.endsWith("(Matt Pocock, MIT)")).toBe(true);
  });
});
