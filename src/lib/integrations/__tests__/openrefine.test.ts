// ════════════════════════════════════════════════════════════════
// INV1025F (parte 3) · OpenRefine — recetas como datos y cliente.
// ----------------------------------------------------------------
// La receta es un dato con lista blanca (R5, R9, R10) y el cliente habla
// con OpenRefine 3.10.1 local por el proxy: token → crear → aplicar →
// exportar → BORRAR (el proyecto se borra siempre, también al fallar).
// ════════════════════════════════════════════════════════════════

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validarReceta } from "../../datos/receta-limpieza";
import { health, limpiar } from "../clients/openrefine";
import type { IntegrationConfig } from "../types";

const CFG: IntegrationConfig = { enabled: true, endpoint: "http://127.0.0.1:3333" };
const REMOTA: IntegrationConfig = { enabled: true, endpoint: "http://ejemplo.org:3333" };

const RECETA = { datos: "publicos", operations: [{ op: "text-transform", expression: "grel:value.trim()" }] };
const RECETA_ES = { datos: "publicos", operaciones: [{ op: "core/text-transform", expression: "grel:value.trim()" }] };
const CSV = "a,b\n1,2";

const RESPUESTAS: Record<string, unknown> = {
  "/command/core/get-csrf-token": "tok-1",
  "/command/core/create-project-from-upload": "pj-7",
  "/command/core/export-rows": CSV,
};

let orden: string[] = [];

/** Servidor falso del proxy de integraciones: responde las rutas de OpenRefine; `fallar` las tumba. */
function servidorFalso(fallar: string[] = []): void {
  vi.stubGlobal("fetch", async (_url: unknown, opciones: Record<string, unknown> = {}) => {
    const cuerpo = JSON.parse(String((opciones as { body?: string }).body || "{}")) as { path?: string };
    const ruta = String(cuerpo.path ?? "");
    orden.push(ruta);
    const fallo = fallar.some((f) => ruta.includes(f));
    return new Response(
      JSON.stringify({ ok: !fallo, data: RESPUESTAS[ruta] ?? "OK", error: fallo ? "falló a propósito" : undefined }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  });
}

beforeEach(() => {
  vi.stubGlobal("window", { location: { origin: "http://localhost:3000" } });
  orden = [];
});
afterEach(() => vi.unstubAllGlobals());

describe("validarReceta — la receta como dato con lista blanca", () => {
  it("acepta una receta pública y de expresiones GREL dentro de los topes", () => {
    expect(validarReceta(RECETA_ES)).toMatchObject({ ok: true });
  });

  it("rechaza Jython, la columna por URLs (SSRF), recon fuera de lista, sin «datos» y el exceso de operaciones", () => {
    const jython: unknown = { ...RECETA_ES, operaciones: [{ op: "core/text-transform", expression: "jython: return x" }] };
    const urls: unknown = { ...RECETA_ES, operaciones: [{ op: "core/column-addition-by-fetching-urls" }] };
    const recon: unknown = { ...RECETA_ES, operaciones: [{ op: "core/recon", config: { service: "http://malo.example" } }] };
    const muchas: unknown = { ...RECETA_ES, operaciones: Array(101).fill(RECETA_ES.operaciones[0]) };
    expect(validarReceta(jython)).toMatchObject({ ok: false });
    expect(validarReceta(urls)).toMatchObject({ ok: false });
    expect(validarReceta(recon)).toMatchObject({ ok: false });
    expect(validarReceta({ operaciones: RECETA_ES.operaciones })).toMatchObject({ ok: false });
    expect(validarReceta(muchas)).toMatchObject({ ok: false });
  });
});

describe("limpiar — token → crear → aplicar → exportar → borrar", () => {
  it("camino feliz: cinco llamadas en orden y el CSV exportado", async () => {
    servidorFalso();
    const r = await limpiar(CFG, { csv: CSV, receta: RECETA });
    expect(r.ok).toBe(true);
    expect(r.datosExportados).toBe(CSV);
    expect(orden.map((p) => p.split("?")[0])).toEqual([
      "/command/core/get-csrf-token",
      "/command/core/create-project-from-upload",
      "/command/core/apply-operations",
      "/command/core/export-rows",
      "/command/core/delete-project",
    ]);
  });

  it("borra el proyecto siempre: si aplicar o exportar fallan también, y con Jython no sale ninguna llamada", async () => {
    servidorFalso(["export-rows"]);
    const r = await limpiar(CFG, { csv: CSV, receta: RECETA });
    expect(r.ok).toBe(false);
    expect(orden.at(-1)).toBe("/command/core/delete-project");
    servidorFalso(["apply-operations"]);
    const r2 = await limpiar(CFG, { csv: CSV, receta: RECETA });
    expect(r2.ok).toBe(false);
    expect(orden.at(-1)).toBe("/command/core/delete-project");
    const jython: unknown = { ...RECETA, operations: [{ op: "text-transform", expression: "jython: return x" }] };
    orden = [];
    const r3 = await limpiar(CFG, { csv: CSV, receta: jython });
    expect(r3.ok).toBe(false);
    expect(orden).toEqual([]);
  });
});

describe("health — get-version y guarda de host", () => {
  it("en loopback pregunta la versión; a un host remoto sin token se niega sin llamadas", async () => {
    servidorFalso();
    const bien = await health(CFG);
    expect(bien.ok).toBe(true);
    expect(orden).toEqual(["/command/core/get-version"]);
    const guarda = await health(REMOTA);
    expect(guarda.ok).toBe(false);
    expect(String(guarda.error)).toContain("loopback");
    expect(orden).toEqual(["/command/core/get-version"]);
  });

  it("con token de pasarela sí habla con el host remoto (get-version)", async () => {
    servidorFalso();
    const conPasarela: IntegrationConfig = { ...REMOTA, extra: { extra: "gwap-1" } };
    const r = await health(conPasarela);
    expect(r.ok).toBe(true);
    expect(orden).toEqual(["/command/core/get-version"]);
  });
});
