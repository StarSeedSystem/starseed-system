// ════════════════════════════════════════════════════════════════
// Stirling-PDF · operaciones del catálogo (tarea PDF1020A)
// ----------------------------------------------------------------
// Pruebas sin red: el catálogo y la detección son puros, y la parte
// de proxy se prueba con fetch simulado (nunca contra la instancia).
// ════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  OPERACIONES_PDF,
  rutasDeApiDocs,
  disponiblesDeRutas,
  operacionesDisponibles,
  ejecutarOperacion,
} from "../stirling-pdf";

const CONFIG = { enabled: true, endpoint: "http://localhost:8080/", apiKey: "clave" };

function responderJson(cuerpo: unknown): Response {
  return new Response(JSON.stringify(cuerpo), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("Catálogo OPERACIONES_PDF", () => {
  it("trae las rutas del contrato, verificadas el 2026-10-20", () => {
    const porId = new Map(OPERACIONES_PDF.map((o) => [o.id, o]));
    const esperadas: [string, string, string[]][] = [
      ["rotar", "/api/v1/general/rotate-pdf", ["angle"]],
      ["dividir", "/api/v1/general/split-pages", ["pageNumbers"]],
      ["quitar-paginas", "/api/v1/general/remove-pages", ["pageNumbers"]],
      ["reordenar", "/api/v1/general/rearrange-pages", ["pageOrder"]],
      ["comprimir", "/api/v1/misc/compress-pdf", ["optimizeLevel"]],
      ["ocr", "/api/v1/misc/ocr-pdf", ["languages"]],
      ["marca-agua", "/api/v1/security/add-watermark", ["watermarkType", "watermarkText"]],
    ];
    expect(porId.size).toBeGreaterThanOrEqual(10);
    for (const [id, ruta, campos] of esperadas) {
      const op = porId.get(id);
      expect(op, id).toBeDefined();
      expect(op?.path).toBe(ruta);
      expect(op?.campos).toEqual(campos);
    }
  });

  it("mantiene las tres operaciones que el cliente ya tenía", () => {
    const ids = OPERACIONES_PDF.map((o) => o.id);
    expect(ids).toContain("merge");
    expect(ids).toContain("to-image");
    expect(ids).toContain("extract-text");
  });

  it("no deja dos operaciones con la misma ruta", () => {
    const rutas = OPERACIONES_PDF.map((o) => o.path);
    expect(new Set(rutas).size).toBe(rutas.length);
  });
});

describe("rutasDeApiDocs y disponiblesDeRutas", () => {
  it("saca las rutas del objeto OpenAPI y filtra el catálogo", () => {
    const doc = {
      openapi: "3.0.1",
      paths: {
        "/api/v1/general/rotate-pdf": {},
        "/api/v1/misc/compress-pdf": {},
        "/api/v1/info/status": {},
      },
    };
    const rutas = rutasDeApiDocs(doc);
    expect(rutas).toContain("/api/v1/general/rotate-pdf");
    const ops = disponiblesDeRutas(rutas);
    expect(ops.map((o) => o.id)).toEqual(["rotar", "comprimir"]);
  });

  it("unwrap del envoltorio { data } que devuelve el proxy", () => {
    const doc = { data: { paths: { "/api/v1/general/split-pages": {} } } };
    expect(disponiblesDeRutas(rutasDeApiDocs(doc)).map((o) => o.id)).toEqual(["dividir"]);
  });

  it("degrada a vacío con documentos inservibles", () => {
    expect(rutasDeApiDocs(null)).toEqual([]);
    expect(rutasDeApiDocs("texto")).toEqual([]);
    expect(rutasDeApiDocs({ paths: "no" })).toEqual([]);
  });
});

/* detección con fetch simulado */
/* detección con fetch simulado */

let fetchOriginal: typeof fetch;
let ventanaOriginal: unknown;

beforeEach(() => {
  fetchOriginal = globalThis.fetch;
  ventanaOriginal = (globalThis as Record<string, unknown>)["window"];
});
afterEach(() => {
  globalThis.fetch = fetchOriginal;
  if (ventanaOriginal === undefined) delete (globalThis as Record<string, unknown>)["window"];
  else (globalThis as Record<string, unknown>)["window"] = ventanaOriginal;
});

function simularFetch(captura: { url: string; cuerpo: unknown }, respuesta: unknown): void {
  (globalThis as Record<string, unknown>)["window"] = {};
  globalThis.fetch = (async (intent: RequestInfo | URL, init?: RequestInit) => {
    captura.url = String(intent);
    captura.cuerpo = init?.body ?? null;
    return responderJson(respuesta);
  }) as unknown as typeof fetch;
}

describe("operacionesDisponibles con fetch simulado", () => {
  it("pregunta /v1/api-docs al proxy y devuelve solo lo que la instancia tiene", async () => {
    const captura = { url: "", cuerpo: null as unknown };
    simularFetch(captura, {
      ok: true,
      data: { paths: { "/api/v1/general/rotate-pdf": {}, "/api/v1/info/status": {}, "/xlsx": {} } },
    });
    const res = await operacionesDisponibles(CONFIG);
    expect(res.ok).toBe(true);
    expect(res.data?.total).toBe(3);
    expect(res.data?.operaciones.map((o) => o.id)).toEqual(["rotar"]);
    const llamada = captura.cuerpo as string;
    expect(llamada).toContain("/v1/api-docs");
    expect(JSON.parse(llamada)).toMatchObject({ endpoint: "http://localhost:8080" });
  });

  it("es honesta cuando la descripción de API no se puede leer", async () => {
    const captura = { url: "", cuerpo: null as unknown };
    simularFetch(captura, { ok: false, error: "Tiempo de espera agotado." });
    const res = await operacionesDisponibles(CONFIG);
    expect(res.ok).toBe(false);
    expect(res.error).toBe("Tiempo de espera agotado.");
  });
});

describe("ejecutarOperacion con fetch simulado", () => {
  it("manda la ruta del catálogo, el campo de fichero y los parámetros", async () => {
    const captura = { url: "", cuerpo: null as unknown };
    simularFetch(captura, { ok: true, data: { base64: "QUFB" } });
    const pdf = new Blob([new Uint8Array([1, 2, 3])], { type: "application/pdf" });
    const res = await ejecutarOperacion(CONFIG, "rotar", pdf, { angle: 180 });
    expect(res.ok).toBe(true);

    expect(captura.url).toBe("/api/integrations/upload");
    const form = captura.cuerpo as FormData;
    expect(form.get("__endpoint")).toBe("http://localhost:8080");
    expect(form.get("__path")).toBe("/api/v1/general/rotate-pdf");
    expect(form.get("__apiKey")).toBe("clave");
    expect(form.get("__accept")).toBe("binary");
    expect(form.get("angle")).toBe("180");
    expect(form.get("fileInput")).toBeInstanceOf(Blob);
  });

  it("usa el defecto del catálogo si no llega parámetro", async () => {
    const captura = { url: "", cuerpo: null as unknown };
    simularFetch(captura, { ok: true, data: {} });
    const pdf = new Blob(["pdf"], { type: "application/pdf" });
    await ejecutarOperacion(CONFIG, "marca-agua", pdf, {});
    const form = captura.cuerpo as FormData;
    expect(form.get("__path")).toBe("/api/v1/security/add-watermark");
    expect(form.get("watermarkType")).toBe("text");
    expect(form.has("watermarkText")).toBe(false);
  });

  it("degrada con honestidad: id desconocido, varios PDF y sin fichero", async () => {
    const captura = { url: "", cuerpo: null as unknown };
    simularFetch(captura, { ok: true, data: {} });
    const pdf = new Blob(["pdf"], { type: "application/pdf" });
    const rId = await ejecutarOperacion(CONFIG, "no-existe", pdf, {});
    expect(rId.ok).toBe(false);
    expect(rId.error).toContain("desconocida");

    const rVarios = await ejecutarOperacion(CONFIG, "dividir", [pdf, pdf], {});
    expect(rVarios.ok).toBe(false);
    expect(rVarios.error).toContain("único PDF");

    const rVacio = await ejecutarOperacion(CONFIG, "dividir", undefined, { pageNumbers: "1" });
    expect(rVacio.ok).toBe(false);
    expect(rVacio.error).toContain("Aporta un PDF");
    expect(captura.url).toBe("");
  });
});
