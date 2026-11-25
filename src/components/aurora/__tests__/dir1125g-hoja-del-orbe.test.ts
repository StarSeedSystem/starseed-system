// @vitest-environment node
/**
 * DIR1125G · la hoja del orbe de Aurora: con un modo de ahorro mandando, el orbe no arranca transiciones (invisibles) en cada cuadro.
 * Medido el 25-11 en la Maggabox: 48 % → 33 % del hilo principal, con la misma imagen en pantalla.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("DIR1125G · la hoja del orbe", () => {
  const css = readFileSync(join(process.cwd(), "src/components/aurora/aurora-orb.module.css"), "utf8");
  const desde = css.indexOf("DIR1125G");
  const bloque = css.slice(desde);

  it("quita las transiciones del orbe entero solo cuando manda un modo de ahorro", () => {
    expect(desde).toBeGreaterThan(0);
    for (const attr of ['data-perf="eco"', 'data-rendimiento="eco"', 'data-rendimiento-efectivo="eco"']) {
      for (const cola of [".root", ".root *", ".root::before", ".root::after", ".root *::before", ".root *::after"]) {
        expect(bloque).toContain(`:global(html[${attr}]) ${cola}`);
      }
    }
    expect(bloque).toMatch(/\{\s*transition:\s*none\s*!important;\s*\}/);
    const inicio = bloque.indexOf(":global(");
    const selectores = bloque.slice(inicio, bloque.indexOf("{", inicio)).split(",").map((s) => s.trim());
    expect(selectores.length).toBe(18);
    for (const s of selectores) expect(s).toMatch(/^:global\(html\[data-(perf|rendimiento|rendimiento-efectivo)="eco"\]\) \.root/);
  });

  it("no toca el diseño de siempre: fuera de los modos de ahorro la esfera conserva su transición", () => {
    expect(css.slice(0, desde)).toContain("transition: box-shadow 0.3s;");
  });
});
