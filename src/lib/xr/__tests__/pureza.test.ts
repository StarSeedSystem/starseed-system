import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FUNCIONES_XR, MODOS_XR, NIVELES_CALIDAD, esFuncionXR, esModoXR, indiceNivel, nivelEn } from "../tipos";

/** Guardia del núcleo XR: puro (sin React, red, DOM ni node:*), ≤ 200 líneas por archivo, sin ejecución de código ni claves. */
const DIR = path.join(__dirname, "..");
const NUCLEO = readdirSync(DIR).filter((f) => f.endsWith(".ts")).map((f) => f.replace(/\.ts$/, ""));
const leer = (n: string) => readFileSync(path.join(DIR, `${n}.ts`), "utf8");

describe("núcleo puro de StarSeed XR", () => {
  it("hay núcleo que vigilar", () => {
    expect(NUCLEO.length).toBeGreaterThanOrEqual(12);
  });
  it.each(NUCLEO)("%s.ts: ≤ 200 líneas", (n) => {
    expect(leer(n).split("\n").length).toBeLessThanOrEqual(200);
  });
  it.each(NUCLEO)("%s.ts: sin React, three, red, DOM, reloj, aleatorio ni ejecución de código", (n) => {
    const src = leer(n).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(src).not.toMatch(/from ["'](react|next|three|@react-three|@pmndrs|node:|fs|path|child_process)/);
    expect(src).not.toMatch(/\b(fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage|document|window|navigator)\b\s*[.(]/);
    expect(src).not.toMatch(/\b(Date\.now|performance\.now|Math\.random|new Date)\b/);
    expect(src).not.toMatch(/\beval\s*\(|new Function\s*\(|import\s*\(/);
    expect(src).not.toMatch(/sk-[A-Za-z0-9]{10}|gsk_|Bearer\s/);
  });
  it.each(NUCLEO)("%s.ts: sólo importa del propio núcleo y de tipos de salas y de la UiSpec", (n) => {
    const importados = [...leer(n).matchAll(/from ["']([^"']+)["']/g)].map((m) => m[1]);
    for (const i of importados) expect(i).toMatch(/^(\.\/|@\/lib\/(salas\/sala|nucleo\/ui-spec)$)/);
  });
});

describe("constantes de tipos", () => {
  it("los modos y niveles son los del contrato", () => {
    expect(MODOS_XR).toEqual(["2d", "3d-pantalla", "vr-inmersivo", "ar-passthrough", "ar-mano"]);
    expect(NIVELES_CALIDAD).toEqual(["minima", "baja", "media", "alta", "maxima"]);
  });
  it("nivelEn acota y indiceNivel es su inverso", () => {
    expect(nivelEn(-3)).toBe("minima");
    expect(nivelEn(99)).toBe("maxima");
    for (const n of NIVELES_CALIDAD) expect(nivelEn(indiceNivel(n))).toBe(n);
  });
  it("las guardas aceptan lo suyo y rechazan lo demás", () => {
    expect(esModoXR("vr-inmersivo") && esFuncionXR("hand-tracking")).toBe(true);
    expect(esModoXR("holograma") || esFuncionXR("teletransporte")).toBe(false);
    expect(new Set(FUNCIONES_XR).size).toBe(FUNCIONES_XR.length);
  });
});
