/**
 * Guardia de la skill coop-qa (CAP1119 · CAP-skill-coop-qa-usob).
 *
 * Cierra dos objeciones del director:
 * 1) «devuelta de la nube … la nube dijo rechazada»: el README tiene que existir y estar completo;
 *    no se puede cerrar por «no escribió nada».
 * 2) «otra ola ya la cerró … no la repito»: el README deja un estado reconocible y apunta a rutas
 *    que existen, para que otra ola compruebe antes de repetir o descartar.
 *
 * Es una guardia de documentación, como `sin-vitest-en-produccion.test.ts`: lee el archivo real.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const README = path.join(RAIZ, ".agent/skills/coop-qa/README.md");

/** Secciones que hacen utilizable la skill; el nombre es el que ve el enjambre. */
const SECCIONES: ReadonlyArray<[string, RegExp]> = [
  ["qué es", /^##\s+Qué es\s*$/im],
  ["cuándo usarla", /^##\s+Cuándo usarla\s*$/im],
  ["ejemplo de uso", /^##\s+Ejemplo de uso\s*$/im],
  ["reglas del enjambre", /^##\s+Reglas del enjambre\s*$/im],
  ["cómo se comprueba", /^##\s+Cómo se comprueba\s*$/im],
  ["estado", /^##\s+Estado\s*$/im],
  ["referencias", /^##\s+Referencias\s*$/im],
];

/** Contenido mínimo que debe estar presente, no solo los títulos. */
const MARCAS: ReadonlyArray<[string, RegExp]> = [
  ["vitest", /\bvitest\b/i],
  ["salas", /\bsalas\b/i],
  ["gratis primero", /gratis primero/i],
  ["relevo 429/402", /429[\s\S]{0,60}402/i],
  ["sin claves", /sin claves|nunca un valor/i],
  ["gemelo mutante", /gemelo mutante/i],
  ["estado integrada", /^estado:\s*integrada\s*$/im],
];

/** Rutas que el README promete; si desaparecen, la documentación miente. */
const REFERENCIAS: ReadonlyArray<{ enTexto: string; archivo: string }> = [
  { enTexto: "./SKILL.md", archivo: ".agent/skills/coop-qa/SKILL.md" },
  { enTexto: "./referencias/automated-qa.md", archivo: ".agent/skills/coop-qa/referencias/automated-qa.md" },
  { enTexto: "src/lib/salas/sincronia-sala.ts", archivo: "src/lib/salas/sincronia-sala.ts" },
  { enTexto: "src/lib/__tests__/salas-sincronia.test.ts", archivo: "src/lib/__tests__/salas-sincronia.test.ts" },
  { enTexto: "src/lib/__tests__/salas-sincronia-fuzz.test.ts", archivo: "src/lib/__tests__/salas-sincronia-fuzz.test.ts" },
];

function faltantes(texto: string): string[] {
  const faltan: string[] = [];
  for (const [nombre, patron] of SECCIONES) if (!patron.test(texto)) faltan.push(`sección «${nombre}»`);
  for (const [nombre, patron] of MARCAS) if (!patron.test(texto)) faltan.push(`marca «${nombre}»`);
  return faltan;
}

function leerReadme(): string {
  return readFileSync(README, "utf8");
}

describe("skill coop-qa · el README que el enjambre usa", () => {
  it("existe y está completo: no se puede cerrar por «no escribió nada»", () => {
    expect(existsSync(README)).toBe(true);
    const texto = leerReadme();
    expect(texto.trim().length).toBeGreaterThan(400);
    expect(faltantes(texto)).toEqual([]);
  });

  it("apunta a rutas reales, para que otra ola compruebe antes de repetir o descartar", () => {
    const texto = leerReadme();
    for (const { enTexto, archivo } of REFERENCIAS) {
      expect(texto, archivo).toContain(enTexto);
      expect(existsSync(path.join(RAIZ, archivo)), archivo).toBe(true);
    }
    expect(texto).toMatch(/punto de relevo/i);
  });

  it("gemelo mutante: sin el ejemplo de uso, la guardia muerde", () => {
    const sinEjemplo = leerReadme().replace(/##\s+Ejemplo de uso[\s\S]*?(?=##\s+Reglas del enjambre)/i, "");
    expect(faltantes(sinEjemplo)).toContain("sección «ejemplo de uso»");
  });
});
