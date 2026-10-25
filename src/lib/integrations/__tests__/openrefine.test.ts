// Pruebas del cliente de OpenRefine (INV1025F): protocolo, orden de llamadas,
// borrado incondicional del proyecto y rechazos de seguridad. El "servidor"
// es un fetch falso que recoge las llamadas y contesta por ruta: sin red real.
import { describe, it, expect } from "vitest";
import { limpiar, health, verificarHost, type FetchAbierto } from "../clients/openrefine";
import { validarReceta, type RecetaLimpieza } from "@/lib/datos/receta-limpieza";

interface Llamada { url: string; cuerpo: string; }

function res(ok: boolean, json: unknown = {}, texto = ""): Response {
  return { ok, status: ok ? 200 : 500, json: async () => json, text: async () => texto } as unknown as Response;
}

/** fetch falso: registra cada llamada y responde según la ruta de la interfaz de órdenes. */
function servidorFalso(trazas: Llamada[], fallarEn: "ninguno" | "crear" | "aplicar" = "ninguno"): FetchAbierto {
  return async (input, init) => {
    const url = String(input);
    const cuerpo = init?.body instanceof URLSearchParams ? init.body.toString() : init?.body ? "multipart" : "";
    trazas.push({ url, cuerpo });
    if (fallarEn === "crear" && url.includes("create-project-from-upload")) return res(false);
    if (fallarEn === "aplicar" && url.includes("apply-operations")) return res(false);
    if (url.includes("get-csrf-token")) return res(true, { token: "secreto-csrf" });
    if (url.includes("create-project-from-upload")) return res(true, { "project-id": 2344556133377 });
    if (url.includes("apply-operations")) return res(true, { status: "ok" });
    if (url.includes("export-rows")) return res(true, {}, "nombre,valor\nana,1\n");
    if (url.includes("delete-project")) return res(true, { status: "ok" });
    if (url.includes("get-version")) return res(true, { version: "3.10.1" });
    return res(false);
  };
}

function recetaValida(): RecetaLimpieza {
  return { datos: "publicos", operaciones: [{ op: "core/text-transform", columnName: "Nombre", expression: "grel:value.trim()" }] };
}

describe("validarReceta", () => {
  it("acepta grel y rechaza lo prohibido por R5/R9", () => {
    expect(validarReceta(recetaValida()).valida).toBe(true);
    expect(validarReceta({ datos: "privados", operaciones: recetaValida().operaciones }).valida).toBe(false);
    expect(validarReceta({ datos: "publicos", operaciones: [{ op: "core/text-transform", expression: "jython:1" }] }).valida).toBe(false);
    expect(validarReceta({ datos: "publicos", operaciones: [{ op: "core/column-addition-by-fetching-urls" }] }).valida).toBe(false);
    expect(validarReceta({ datos: "publicos", operaciones: [{ op: "core/otra-op" }] }).valida).toBe(false);
    expect(validarReceta({
      datos: "publicos", servicioReconciliacion: "http://otro-servicio.org/api",
      operaciones: recetaValida().operaciones,
    }).valida).toBe(false);
    expect(validarReceta({
      datos: "publicos", servicioReconciliacion: "https://www.wikidata.org/api",
      operaciones: recetaValida().operaciones,
    }).valida).toBe(true);
    const masDeCien = Array.from({ length: 101 }, () => recetaValida().operaciones[0]);
    expect(validarReceta({ datos: "publicos", operaciones: masDeCien }).valida).toBe(false);
  });
});

describe("cliente OpenRefine", () => {
  it("respeta el orden token → crear → aplicar → exportar → borrar y devuelve el CSV", async () => {
    const trazas: Llamada[] = [];
    const resultado = await limpiar({ fetchInyectado: servidorFalso(trazas) }, { csv: "nombre\nana\n", receta: recetaValida() });
    expect(resultado.ok).toBe(true);
    expect(resultado.csv).toContain("ana");
    expect(resultado.proyectoId).toBe("2344556133377");
    expect(trazas.map((t) => new URL(t.url).pathname)).toEqual([
      "/command/core/get-csrf-token", "/command/core/create-project-from-upload",
      "/command/core/apply-operations", "/command/core/export-rows", "/command/core/delete-project",
    ]);
    expect(new URLSearchParams(trazas[2].cuerpo).get("operations")).toBe(JSON.stringify(recetaValida().operaciones));
    const exportar = new URLSearchParams(trazas[3].cuerpo);
    expect(exportar.get("project")).toBe("2344556133377");
    expect(exportar.get("engine")).toBe("{}");
    expect(new URLSearchParams(trazas[4].cuerpo).get("project")).toBe("2344556133377");
  });

  it("borra el proyecto también cuando falla un paso intermedio", async () => {
    const trazas: Llamada[] = [];
    const resultado = await limpiar({ fetchInyectado: servidorFalso(trazas, "aplicar") }, { csv: "a,b\n1,2\n", receta: recetaValida() });
    expect(resultado.ok).toBe(false);
    const ultima = trazas[trazas.length - 1];
    expect(new URL(ultima.url).pathname).toBe("/command/core/delete-project");
    expect(new URLSearchParams(ultima.cuerpo).get("project")).toBe("2344556133377");
  });

  it("rechaza una receta con jython sin llamar al servicio", async () => {
    const recetaJython: RecetaLimpieza = { datos: "publicos", operaciones: [{ op: "core/text-transform", expression: "jython:import os" }] };
    expect(validarReceta(recetaJython).valida).toBe(false);
    const trazas: Llamada[] = [];
    const resultado = await limpiar({ fetchInyectado: servidorFalso(trazas) }, { csv: "a\n1\n", receta: recetaJython });
    expect(resultado.ok).toBe(false);
    expect(resultado.error).toContain("jython");
    expect(trazas).toEqual([]);
  });

  it("rechaza un host remoto sin token de pasarela, y lo permite con él", async () => {
    expect(verificarHost("ejemplo.com")).toContain("pasarela");
    expect(verificarHost("127.0.0.1")).toBeNull();
    expect(verificarHost("ejemplo.com", "token-pasarela")).toBeNull();
    const trazas: Llamada[] = [];
    const resultado = await limpiar({ fetchInyectado: servidorFalso(trazas), endpoint: "http://ejemplo.com:3333" }, { csv: "a\n1\n", receta: recetaValida() });
    expect(resultado.ok).toBe(false);
    expect(trazas).toEqual([]);
  });

  it("salud devuelve la versión del servicio", async () => {
    const trazas: Llamada[] = [];
    const resultado = await health({ fetchInyectado: servidorFalso(trazas) });
    expect(resultado).toEqual({ ok: true, version: "3.10.1" });
    expect(new URL(trazas[0].url).pathname).toBe("/command/core/get-version");
  });
});
