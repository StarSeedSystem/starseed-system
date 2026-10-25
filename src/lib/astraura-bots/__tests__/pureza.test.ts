import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EMOCIONES, RASGOS, SENTIDOS, SENTIDOS_INTIMOS, acortar, esBotDeEntidad, esInvitado, esRol, esSentido } from "../tipos";

/** Guardia del núcleo de bots: puro (sin React, red, DOM, reloj ni node:*), ≤ 200 líneas, sin ejecutar código. */
const DIR = path.join(__dirname, "..");
const NUCLEO = readdirSync(DIR).filter((f) => f.endsWith(".ts")).map((f) => f.replace(/\.ts$/, ""));
const leer = (n: string) => readFileSync(path.join(DIR, `${n}.ts`), "utf8");
const CONECTORES = NUCLEO;

describe("núcleo puro de los bots de Astraura", () => {
  it("están los seis módulos del contrato (los que se añaden arriba también han de ser puros)", () => {
    expect(NUCLEO).toEqual(expect.arrayContaining(["acciones", "bucle", "permisos", "personalidad-adaptable", "reparto-de-modelo", "tipos"]));
  });
  it.each(NUCLEO)("%s.ts: ≤ 200 líneas", (n) => {
    expect(leer(n).split("\n").length).toBeLessThanOrEqual(200);
  });
  it.each(NUCLEO)("%s.ts: sin React, red, DOM, reloj, aleatorio ni ejecución de código", (n) => {
    const src = leer(n).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(src).not.toMatch(/from ["'](react|next|three|@react-three|node:|fs|path|child_process)/);
    expect(src).not.toMatch(/\b(fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage|document|window|navigator)\b\s*[.(]/);
    expect(src).not.toMatch(/\b(Date\.now|performance\.now|Math\.random|new Date)\b/);
    expect(src).not.toMatch(/\beval\s*\(|new Function\s*\(|import\s*\(/);
  });
  it.each(NUCLEO)("%s.ts: solo importa del propio núcleo y del núcleo del OS", (n) => {
    const importados = [...leer(n).matchAll(/from ["']([^"']+)["']/g)].map((m) => m[1]);
    for (const i of importados) expect(i).toMatch(/^(\.\/|@\/lib\/nucleo\/(alcance-memoria|ui-spec|paquete-sistema)$)/);
  });
  it("los conectores existen y no están vacíos", () => {
    for (const c of CONECTORES) {
      if (NUCLEO.includes(c)) expect(leer(c).split("\n").length).toBeGreaterThan(0);
    }
  });
});

describe("tipos", () => {
  it("los sentidos íntimos son sentidos y no se repiten", () => {
    for (const s of SENTIDOS_INTIMOS) expect(esSentido(s)).toBe(true);
    expect(new Set(SENTIDOS).size).toBe(SENTIDOS.length);
    expect(SENTIDOS_INTIMOS).toContain("camara");
    expect(SENTIDOS_INTIMOS).toContain("microfono");
    expect(SENTIDOS_INTIMOS).not.toContain("red");
  });
  it("rasgos y emociones son los del contrato", () => {
    expect(RASGOS).toEqual(["calidez", "energia", "formalidad", "curiosidad", "humor", "concision"]);
    expect(EMOCIONES).toContain("ternura");
  });
  it("las guardas aceptan lo suyo y rechazan lo demás", () => {
    expect(esRol("miembro") && esSentido("pantalla")).toBe(true);
    expect(esRol("rey") || esSentido("telepatia") || esSentido(3)).toBe(false);
  });
  it("acotar respeta los bordes y convierte lo no finito al mínimo", () => {
    expect(acotar(2)).toBe(1);
    expect(acotar(-1)).toBe(0);
    expect(acotar(Number.NaN, -1, 1)).toBe(-1);
  });
  it("un bot de grupo es de entidad; uno externo o AG-UI es invitado", () => {
    expect(esBotDeEntidad({ dueno: { tipo: "grupo", id: "g", cuentaId: "c" } })).toBe(true);
    expect(esBotDeEntidad({ dueno: { tipo: "perfil", id: "p", cuentaId: "c" } })).toBe(false);
    expect(esInvitado({ origen: "externo" }) && esInvitado({ origen: "ag-ui" })).toBe(true);
    expect(esInvitado({ origen: "astraura" })).toBe(false);
  });
});