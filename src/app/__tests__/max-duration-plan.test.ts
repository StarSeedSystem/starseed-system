import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Guardia del plan de Vercel (Hobby): toda ruta con `maxDuration` debe estar entre 1 y 300 s. Una sola fuera de
 * rango hace fallar TODO el despliegue de producción en «Deploying outputs» (invalid_max_duration), aunque la
 * build termine bien: pasó con /api/conversion (900) del 2026-10-25 al 2026-10-26.
 */
const TOPE_PLAN_S = 300;

function rutas(dir: string, acc: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) rutas(p, acc);
    else if (/^route\.(ts|tsx|js)$/.test(n)) acc.push(p);
  }
  return acc;
}

describe("maxDuration de las rutas dentro del plan de Vercel", () => {
  it(`ninguna ruta pide más de ${TOPE_PLAN_S} s ni menos de 1`, () => {
    const fuera: string[] = [];
    for (const r of rutas(join(process.cwd(), "src", "app"))) {
      const m = readFileSync(r, "utf8").match(/export\s+const\s+maxDuration\s*=\s*(\d+)/);
      if (m && (Number(m[1]) < 1 || Number(m[1]) > TOPE_PLAN_S)) fuera.push(`${r}: ${m[1]}`);
    }
    expect(fuera).toEqual([]);
  });
});
