// PDF1020A — Stirling-PDF según lo que la instancia tenga. Pruebas con
// fetch simulado (sin red ni disco); catálogo verificado 2026-10-20.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OPERACIONES_PDF, ejecutarOperacion, operacionesDeRutas, operacionesDisponibles, rutasDesdeApiDocs } from "../stirling-pdf";
import { runIntegration } from "../../run";

beforeEach(() => vi.stubGlobal("window", {})); // el cliente solo trabaja en el navegador
afterEach(() => vi.unstubAllGlobals());

describe("OPERACIONES_PDF — catálogo verificado (id, ruta, campos)", () => {
  it("declara cada operación con sus rutas y campos exactos", () => {
    expect(OPERACIONES_PDF.map((o) => [o.id, o.ruta, o.campos])).toEqual([
      ["fusionar", "/api/v1/general/merge-pdfs", []],
      ["imagen", "/api/v1/convert/pdf/img", []],
      ["texto", "/api/v1/convert/pdf/text", []],
      ["rotar", "/api/v1/general/rotate-pdf", ["angle"]],
      ["dividir", "/api/v1/general/split-pages", ["pageNumbers"]],
      ["quitar-paginas", "/api/v1/general/remove-pages", ["pageNumbers"]],
      ["reordenar", "/api/v1/general/rearrange-pages", ["pageOrder"]],
      ["comprimir", "/api/v1/misc/compress-pdf", ["optimizeLevel"]],
      ["ocr", "/api/v1/misc/ocr-pdf", ["languages"]],
      ["marca-agua", "/api/v1/security/add-watermark", ["watermarkType", "watermarkText"]],
    ]);
  });
});

/** Descripción de API simulada (OpenAPI): solo ciertas rutas presentes. */
const API_DOCS = {
  paths: {
    "/api/v1/general/merge-pdfs": { post: {} }, "/api/v1/general/rotate-pdf": { post: {} },
    "/api/v1/general/split-pages": { post: {} }, "/api/v1/misc/ocr-pdf": { post: {} },
    "/api/v1/info/status": { get: {} }, "/swagger-ui/index.html": { get: {} },
  },
};

describe("rutasDesdeApiDocs / operacionesDeRutas — puros", () => {
  it("extrae solo las rutas /api/… del OpenAPI (y tolera formas vacías)", () => {
    expect(rutasDesdeApiDocs(API_DOCS).sort()).toEqual([
      "/api/v1/general/merge-pdfs", "/api/v1/general/rotate-pdf",
      "/api/v1/general/split-pages", "/api/v1/info/status", "/api/v1/misc/ocr-pdf",
    ]);
    expect(rutasDesdeApiDocs(null)).toEqual([]);
    expect(rutasDesdeApiDocs({})).toEqual([]);
  });

  it("ofrece solo lo que la instancia tiene; lo que falta no aparece", () => {
    expect(operacionesDeRutas(rutasDesdeApiDocs(API_DOCS)).map((o) => o.id))
      .toEqual(["fusionar", "rotar", "dividir", "ocr"]);
    // Contra una instancia completa sale el catálogo entero.
    expect(operacionesDeRutas(OPERACIONES_PDF.map((o) => o.ruta))).toEqual([...OPERACIONES_PDF]);
  });
});

describe("operacionesDisponibles — con fetch simulado", () => {
  it("pide /v1/api-docs por el proxy JSON y filtra el catálogo", async () => {
    let cuerpo: Partial<{ path: string; auth: string; apiKey: string }> = {};
    vi.stubGlobal("fetch", async (url: string, opciones: { body?: string } = {}) => {
      if (url === "/api/integrations/proxy" && typeof opciones.body === "string") cuerpo = JSON.parse(opciones.body) as typeof cuerpo;
      return new Response(JSON.stringify({ ok: true, data: API_DOCS }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const res = await operacionesDisponibles({ endpoint: "http://127.0.0.1:8180/", apiKey: "clave-1" });
    expect(res.ok).toBe(true);
    expect((res.data as { operaciones: { id: string }[] }).operaciones.map((o) => o.id))
      .toEqual(["fusionar", "rotar", "dividir", "ocr"]);
    expect(cuerpo.path).toBe("/v1/api-docs");
    expect(cuerpo.auth).toBe("x-api-key");
    expect(cuerpo.apiKey).toBe("clave-1");
  });

  it("reporta honesto si el proxy no llega a la descripción de API", async () => {
    vi.stubGlobal("fetch", async () =>
      new Response(JSON.stringify({ ok: false, error: "Tiempo de espera agotado." }), { status: 200 }));
    expect((await operacionesDisponibles({ endpoint: "http://127.0.0.1:8180" })).ok).toBe(false);
  });
});

describe("ejecutarOperacion — con fetch simulado", () => {
  /** Captura el FormData y contea las llamadas que van al proxy multipart. */
  function simularFetch(respuesta: unknown): { get form(): FormData | undefined; get peticiones(): number } {
    let form: FormData | undefined;
    let peticiones = 0;
    vi.stubGlobal("fetch", async (url: string, opciones: { body?: FormData | string } = {}) => {
      peticiones++;
      if (typeof opciones.body === "object" && typeof opciones.body?.get === "function") form = opciones.body;
      return new Response(JSON.stringify(respuesta), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    return { get form() { return form; }, get peticiones() { return peticiones; } };
  }

  it("rotar: manda fileInput y angle por el proxy multipart", async () => {
    const sim = simularFetch({ ok: true, data: { base64: "SG9sYS1QREY=" } });
    const res = await ejecutarOperacion({ endpoint: "http://127.0.0.1:8180" }, "rotar", new Blob(["pdf"], { type: "application/pdf" }), { angle: "90" });
    expect(res.ok).toBe(true);
    expect(sim.peticiones).toBe(1);
    expect(sim.form!.get("__path")).toBe("/api/v1/general/rotate-pdf");
    expect(sim.form!.get("angle")).toBe("90");
    expect(sim.form!.get("fileInput")).toBeInstanceOf(Blob);
  });

  it("marca-agua: manda los dos campos exigidos", async () => {
    const sim = simularFetch({ ok: true, data: { base64: "bWFyY2E=" } });
    const res = await ejecutarOperacion({ endpoint: "http://127.0.0.1:8180" }, "marca-agua",
      new Blob(["pdf"], { type: "application/pdf" }), { watermarkType: "text", watermarkText: "StarSeed" });
    expect(res.ok).toBe(true);
    expect([(sim.form as FormData).get("watermarkType"), sim.form!.get("watermarkText")]).toEqual(["text", "StarSeed"]);
  });

  it("falla honesto con campo que falta o id desconocido, sin llamar al proxy", async () => {
    const sinCampo = simularFetch({ ok: true });
    const rotarMal = await ejecutarOperacion({ endpoint: "e" }, "rotar", new Blob(["pdf"]), {});
    expect(rotarMal.ok).toBe(false);
    expect((rotarMal as { error?: string }).error).toContain("angle");
    expect(sinCampo.peticiones).toBe(0);
    const idFalso = simularFetch({ ok: true });
    const opFalsa = await ejecutarOperacion({ endpoint: "e" }, "no-existe", new Blob(["pdf"]), {});
    expect(opFalsa.ok).toBe(false);
    expect((opFalsa as { error?: string }).error).toContain("no-existe");
    expect(idFalso.peticiones).toBe(0);
  });
});

describe("runIntegration · el catálogo queda conectado al despacho", () => {
  const cfg = { endpoint: "http://127.0.0.1:8180" };

  it("filtra una descripción de API ya obtenida sin llamar a la red", async () => {
    let llamadas = 0;
    vi.stubGlobal("fetch", async () => { llamadas++; return new Response("{}"); });
    const res = await runIntegration("stirling-pdf", "operaciones", { apiDocs: API_DOCS }, cfg);
    expect(res.ok).toBe(true);
    const datos = res.data as { rutas: string[]; operaciones: { id: string }[] };
    expect(datos.rutas).toContain("/api/v1/general/rotate-pdf");
    expect(datos.operaciones.map((o) => o.id)).toEqual(["fusionar", "rotar", "dividir", "ocr"]);
    expect(llamadas).toBe(0);
  });

  it("rechaza una operación fuera del catálogo antes de tocar el proxy", async () => {
    let llamadas = 0;
    vi.stubGlobal("fetch", async () => { llamadas++; return new Response("{}"); });
    const res = await runIntegration("stirling-pdf", "operar", { operacion: "no-existe", file: new Blob(["pdf"]) }, cfg);
    expect(res.ok).toBe(false);
    expect((res as { error?: string }).error).toContain("no-existe");
    expect((res as { error?: string }).error).toContain("rotar");
    expect(llamadas).toBe(0);
  });
});
