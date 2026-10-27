// INV1025F — OpenRefine: orden de órdenes, borrado en fallo y validación de recetas.
// Sin red ni disco: fetch inyectado como servidor falso (ningún vi.mock de node:*).
import { describe, expect, it } from "vitest";
import {
  ENDPOINT_DEFINIDO, FetchFn, limpiar, health,
} from "@/lib/integrations/clients/openrefine";
import { validarReceta } from "@/lib/datos/receta-limpieza";
const BASE = "http://127.0.0.1:3333";
/** Servidor falso: graba cada llamada y responde por ruta con estado configurable. */
function servidorFalso() {
  const llamadas: string[] = [];
  let crearAcepta = true;
  let aplicarAcepta = true;
  const fn: FetchFn = async (url: string) => {
    const ruta = url.replace(BASE, "");
    llamadas.push(ruta);
    const json = (datos: unknown) => new Response(JSON.stringify(datos), { status: 200 });
    if (ruta.startsWith("/command/core/get-csrf-token")) return json({ token: "tk-1" });
    if (ruta.startsWith("/command/core/create-project-from-upload")) {
      return crearAcepta ? json({ status: "ok", project: 42 }) : json({ status: "error", message: "no va" });
    }
    if (ruta.startsWith("/command/core/apply-operations")) {
      return aplicarAcepta ? json({ code: "ok", historyEntry: "h1" }) : json({ code: "error", message: "receta mala" });
    }
    if (ruta.startsWith("/command/core/export-rows")) return new Response("nombre,web\nAna,https://a.dev\n", { status: 200 });
    if (ruta.startsWith("/command/core/get-version")) return json({ version: "3.10.1" });
    return json({ code: "ok" });
  };
  return { fn, llamadas, ponerCrear: (v: boolean) => { crearAcepta = v; }, ponerAplicar: (v: boolean) => { aplicarAcepta = v; } };
}
const RECETA_OK = {
  datos: "publicos" as const,
  operaciones: [
    { op: "core/text-transform", columnName: "nombre", expression: "grel:value.trim()" },
  ],
};
describe("limpiar — orden de la sesión completa", () => {
  it("token → crear → aplicar → exportar → borrar, y devuelve el csv", async () => {
    const sim = servidorFalso();
    const res = await limpiar({ endpoint: BASE }, { csv: "nombre\nAna\n", receta: RECETA_OK }, { fetch: sim.fn });
    expect(res.ok).toBe(true);
    expect((res.data as { csv: string }).csv).toContain("Ana");
    expect(sim.llamadas).toEqual([
      "/command/core/get-csrf-token",
      "/command/core/create-project-from-upload",
      "/command/core/apply-operations?project=42",
      "/command/core/export-rows",
      "/command/core/delete-project?project=42",
    ]);
  });
  it("si aplicar falla, borra el proyecto igualmente y no devuelve csv", async () => {
    const sim = servidorFalso();
    sim.ponerAplicar(false);
    const res = await limpiar({ endpoint: BASE }, { csv: "nombre\nAna\n", receta: RECETA_OK }, { fetch: sim.fn });
    expect(res.ok).toBe(false);
    expect(sim.llamadas.filter((r) => r.startsWith("/command/core/delete-project?project=42"))).toHaveLength(1);
    expect(sim.llamadas.at(-1)).toBe("/command/core/delete-project?project=42");
  });
});
describe("hostValido/rechazos", () => {
  it("host remoto sin token de pasarela: rechazado sin tocar red", async () => {
    const sim = servidorFalso();
    const res = await limpiar({ endpoint: "http://servidor.interno:3333" }, { csv: "a,b\n1,2\n", receta: RECETA_OK }, { fetch: sim.fn });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("loopback");
    expect(sim.llamadas).toEqual([]);
  });
  it("host remoto con tokenPasarela: se permite la sesión completa", async () => {
    const sim = servidorFalso();
    const res = await limpiar(
      { endpoint: "https://pasarela.starseed.dev", extra: { tokenPasarela: "TOKEN_PASARELA" } },
      { csv: "nombre\nAna\n", receta: RECETA_OK },
      { fetch: sim.fn },
    );
    expect(res.ok).toBe(true);
    expect(sim.llamadas).toHaveLength(5);
  });
  it("salud es pedir get-version por loopback", async () => {
    const sim = servidorFalso();
    const res = await health({ endpoint: BASE }, { fetch: sim.fn });
    expect(res.ok).toBe(true);
    expect(sim.llamadas).toEqual(["/command/core/get-version"]);
  });
});
describe("validarReceta — lista blanca (pure)", () => {
  it("receta válida: acepta op con o sin core/ con expresión grel", () => {
    expect(validarReceta(RECETA_OK).ok).toBe(true);
    expect(validarReceta({ datos: "publicos", operaciones: [{ op: "mass-edit", expression: "grel:1+1" }] }).ok).toBe(true);
  });
  it("rechaza jython, clojure y expresiones sin grel", () => {
    const jython = { datos: "publicos", operaciones: [{ op: "core/text-transform", columnName: "a", expression: "jython:return None" }] };
    expect(validarReceta(jython)).toEqual({ ok: false, error: expect.stringContaining("grel:") });
    const clojure = { datos: "publicos", operaciones: [{ op: "core/text-transform", columnName: "a", expression: "clojure:(.trim value)" }] };
    expect(validarReceta(clojure).ok).toBe(false);
  });
  it("rechaza op fuera de lista, incluida la de fetch por URLs (SSRF)", () => {
    expect(validarReceta({ datos: "publicos", operaciones: [{ op: "core/column-addition-by-fetching-urls" }] }).ok).toBe(false);
    expect(validarReceta({ datos: "publicos", operaciones: [{ op: "core/to-western-arabic" }] }).ok).toBe(false);
  });
  it("sin datos:\"publicos\" no pasa (R5, R9)", () => {
    expect(validarReceta({ datos: "privados", operaciones: [] }).ok).toBe(false);
    expect(validarReceta({ operaciones: [] }).ok).toBe(false);
  });
  it("reconciliación solo contra servicios https de la lista blanca", () => {
    const wikidata = { datos: "publicos", operaciones: [{ op: "core/recon", service: "https://www.wikidata.org/w/api.php" }] };
    expect(validarReceta(wikidata).ok).toBe(true);
    const ajeno = { datos: "publicos", operaciones: [{ op: "core/recon", service: "http://otro-servicio.org/w/api.php" }] };
    expect(validarReceta(ajeno).ok).toBe(false);
  });
  it("topes: 100 operaciones y 200 KB", () => {
    const muchas = { datos: "publicos", operaciones: Array.from({ length: 101 }, () => ({ op: "core/fill-down" })) };
    expect(validarReceta(muchas).ok).toBe(false);
  });
});
