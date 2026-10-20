import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AMBITOS, METRICAS_SALUD, ORIGENES, PALABRAS_UNIDAD, ROLES, esAmbito, esMetricaSalud, esOrigen } from "../tipos";

/** Guardia del núcleo: puro (sin React, red ni node:*), ≤ 200 líneas por archivo, sin claves ni ejecución de código. */
const NUCLEO = ["tipos", "parametros", "dictado", "vinculos-control", "permisos"];
/** Otros módulos puros que se rigen por la MISMA guardia (aparte de NUCLEO para no pisar su lista): el puente OS⇄herramienta. */
const PUROS_DEL_PUENTE = ["puente-herramientas"];
const PUROS = [...NUCLEO, ...PUROS_DEL_PUENTE];
const leer = (n: string) => readFileSync(path.join(__dirname, "..", `${n}.ts`), "utf8");

describe("núcleo puro de la Protomolécula", () => {
  it.each(PUROS)("%s.ts: ≤ 200 líneas", (n) => {
    expect(leer(n).split("\n").length).toBeLessThanOrEqual(200);
  });
  it.each(PUROS)("%s.ts: sin React, red, node:* ni ejecución de código", (n) => {
    const src = leer(n);
    expect(src).not.toMatch(/from ["'](react|next|node:|fs|path|child_process)/);
    expect(src).not.toMatch(/\b(fetch|XMLHttpRequest|WebSocket|localStorage|document|window)\b\s*[.(]/);
    expect(src).not.toMatch(/\beval\s*\(|new Function\s*\(|import\s*\(/);
    expect(src).not.toMatch(/sk-[A-Za-z0-9]{10}|gsk_|Bearer\s/);
  });
  it.each(PUROS)("%s.ts: las únicas dependencias son del propio núcleo, de salas y de alcance-memoria", (n) => {
    const importados = [...leer(n).matchAll(/from ["']([^"']+)["']/g)].map((m) => m[1]);
    for (const i of importados) expect(i).toMatch(/^(\.\/|@\/lib\/(salas\/sala|nucleo\/alcance-memoria)$)/);
  });
});

describe("constantes de tipos", () => {
  it("los ámbitos, roles, orígenes y métricas son los del contrato", () => {
    expect(AMBITOS).toEqual(["personal", "perfil", "grupo", "publica"]);
    expect(ROLES).toEqual(["dueno", "editor", "comentarista", "observador"]);
    expect(ORIGENES).toEqual(["mano", "ia", "dictado", "midi", "gamepad", "hid", "osc", "sensor", "agente"]);
    expect(new Set(METRICAS_SALUD).size).toBe(METRICAS_SALUD.length);
  });
  it("las guardas aceptan lo suyo y rechazan lo demás", () => {
    expect(esOrigen("midi") && esAmbito("grupo") && esMetricaSalud("pulso")).toBe(true);
    expect(esOrigen("teclado") || esAmbito("mundo") || esMetricaSalud("horoscopo")).toBe(false);
  });
  it("cada unidad se puede dictar", () => {
    for (const palabras of Object.values(PALABRAS_UNIDAD)) expect(palabras.length).toBeGreaterThan(0);
  });
});
