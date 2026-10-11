import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** Guardia del núcleo de avatares: puro (sin React, three, red, DOM, reloj ni aleatorio) y ≤ 200 líneas por archivo. */
const DIR = path.join(__dirname, "..");
const NUCLEO = readdirSync(DIR).filter((f) => f.endsWith(".ts")).map((f) => f.replace(/\.ts$/, ""));
const leer = (n: string) => readFileSync(path.join(DIR, `${n}.ts`), "utf8");

describe("núcleo puro de avatares 3D", () => {
  it("están los siete módulos del contrato", () => {
    expect(NUCLEO).toEqual(expect.arrayContaining(["adn", "cambios", "dictado", "motores", "canalizacion", "calidad", "permisos"]));
  });
  it.each(NUCLEO)("%s.ts: ≤ 200 líneas", (n) => {
    expect(leer(n).split("\n").length).toBeLessThanOrEqual(200);
  });
  it.each(NUCLEO)("%s.ts: sin React, three, red, DOM, reloj ni aleatorio", (n) => {
    const src = leer(n).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(src).not.toMatch(/from ["'](react|next|three|@react-three|@pixiv|node:|fs|path|child_process)/);
    expect(src).not.toMatch(/\b(fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage|document|window|navigator)\b\s*[.(]/);
    expect(src).not.toMatch(/\b(Date\.now|performance\.now|Math\.random|new Date)\b/);
    expect(src).not.toMatch(/\beval\s*\(|new Function\s*\(|import\s*\(/);
  });
  it.each(NUCLEO)("%s.ts: solo importa del propio núcleo y de tipos de bots y XR", (n) => {
    const importados = [...leer(n).matchAll(/from ["']([^"']+)["']/g)].map((m) => m[1]);
    for (const i of importados) expect(i).toMatch(/^(\.\/|@\/lib\/astraura-bots\/tipos$|@\/lib\/xr\/calidad-perfiles$)/);
  });
});
