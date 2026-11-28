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
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const README_REL = ".agent/skills/coop-qa/README.md";
const README = path.join(RAIZ, README_REL);

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

function git(args: string[]): { ok: boolean; salida: string } {
  const r = spawnSync("git", args, { cwd: RAIZ, encoding: "utf8" });
  return { ok: r.status === 0, salida: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() };
}

/** Lo que una ola posterior lee para decidir si repite, descarta o amplía. */
function problemasDeEstado(texto: string): string[] {
  const problemas: string[] = [];
  const estado = texto.match(/^estado:\s*(\S+)\s*$/im)?.[1]?.toLowerCase();
  if (estado !== "integrada") {
    problemas.push(`estado «${estado ?? "ausente"}»: no está integrada, hay que hacerla`);
  }
  if (!/punto de relevo/i.test(texto)) problemas.push("falta el punto de relevo");
  if (!/git ls-files --error-unmatch/i.test(texto)) problemas.push("no enseña cómo comprobar que está en git");
  return problemas;
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

describe("objeciones del director (2026-11-23 y 2026-11-24)", () => {
  it("1 · devuelta de la nube: el README está trackeado, no solo en el disco", () => {
    const seguido = git(["ls-files", "--error-unmatch", "--", README_REL]);
    expect(seguido.ok, `«${README_REL}» debe estar en git (git add -f): ${seguido.salida}`).toBe(true);
    const ignorado = git(["check-ignore", "-q", "--", README_REL]);
    expect(ignorado.ok, `«${README_REL}» no puede quedar ignorado por .agent/: ${ignorado.salida}`).toBe(false);
  });

  it("2 · otra ola no la cierra por «rechazada»: estado integrada y gemelo mutante", () => {
    const texto = leerReadme();
    expect(problemasDeEstado(texto)).toEqual([]);

    const mutado = texto.replace(/^estado:\s*\S+\s*$/im, "estado: rechazada");
    expect(problemasDeEstado(mutado).join(" ")).toMatch(/rechazada/);

    const sinEstado = texto.replace(/^estado:.*$/im, "");
    expect(problemasDeEstado(sinEstado)).not.toEqual([]);
  });
});
