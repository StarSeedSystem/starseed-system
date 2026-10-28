/**
 * Pruebas de `memvid-cliente` (MVD1027D) con fetch falso: nada de red ni disco — el token y
 * la base se inyectan y el fetch contesta en memoria. Sin `vi.mock` de módulos de Node.
 */
import { describe, expect, it, vi } from "vitest";
import {
  aciertosDe, acotaK, estado, estadoDe, linea, lineaDe, poner, salud, buscar,
  nombreValido, sujetoDeCadena, type OpcionesMemvid,
} from "../memvid-cliente";

vi.mock("server-only", () => ({}));

const RESPUESTA = (status: number, cuerpo: unknown): Response =>
  new Response(JSON.stringify(cuerpo), { status });
const OPS: OpcionesMemvid = { token: "prueba", base: "http://127.0.0.1:4490", ahora: new Date("2026-10-27T00:00:00Z") };
type FetchFalso = (url: string, init?: RequestInit) => Promise<Response>;

describe("sujetoDeCadena · «tipo:id» con la familia exacta", () => {
  it("acepta los tipos del contrato y conserva el id tal cual (el saneado va aparte)", () => {
    expect(sujetoDeCadena("personalidad:aurora")).toEqual({ tipo: "personalidad", id: "aurora" });
    expect(sujetoDeCadena("  perfil:Álex Café_2  ")).toEqual({ tipo: "perfil", id: "Álex Café_2" });
  });
  it("rechaza tipo ajeno, id vacío o forma rota", () => {
    expect(sujetoDeCadena("deidad:aurora")).toBeNull();
    expect(sujetoDeCadena("personalidad: ")).toBeNull();
    expect(sujetoDeCadena("personalidad:")).toBeNull();
    expect(sujetoDeCadena("aurora")).toBeNull();
  });
});

describe("nombreValido · la forma que admite el servidor del núcleo", () => {
  it("acepta la cápsula y rechaza rutas, puntos y extensiones raras", () => {
    expect(nombreValido("personalidad-aurora-2026t4.mv2")).toBe(true);
    expect(nombreValido("personalidad-aurora-2026T4.mv2e")).toBe(true);
    for (const mala of ["x/y.mv2", "..", "x.mv2.bak", "A.mv2", ".mv2"])
      expect(nombreValido(mala)).toBe(false);
  });
});

describe("normalizadores · el JSON del servidor entra honesto o fuera", () => {
  it("estadoDe trae fotogramas, tamaño, tope y cuánto queda", () => {
    expect(estadoDe({ frame_count: 12, size_bytes: 47_616_000, capacity_bytes: 52_428_800 }))
      .toEqual({ fotogramas: 12, bytes: 47_616_000, tope: 52_428_800, queda: 4_812_800 });
  });
  it("estadoDe con forma rota es null; acotaK manda todo al rango 1…50 con defecto 5", () => {
    expect(estadoDe("sin JSON")).toBeNull();
    expect(estadoDe({ frame_count: 1 })).toBeNull();
    expect(acotaK(undefined)).toBe(5);
    for (const [pide, sale] of [[0, 5], [-3, 5], [9, 9], [999, 50]] as const)
      expect(acotaK(pide)).toBe(sale);
  });
  it("aciertosDe y lineaDe dejan pasar solo entradas completas", () => {
    expect(aciertosDe({ aciertos: [{ texto: "b", titulo: "t", ts: "8" }, { titulo: "sin texto" }, "x"] }))
      .toEqual([expect.objectContaining({ texto: "b", titulo: "t", ts: 8 })]);
    expect(aciertosDe({ aciertos: "no" })).toEqual([]);
    expect(lineaDe({ linea: [{ frame_id: 3, timestamp: 1761600000, preview: "paso" }] })[0]?.id).toBe(3);
    expect(lineaDe({ linea: [{ frame_id: 3 }] })).toEqual([]);
    expect(lineaDe(null)).toEqual([]);
  });
});

describe("estado · GET /capsulas/<nombre>/estado con el token en cabecera", () => {
  const f = vi.fn<FetchFalso>(async (url) => RESPUESTA(200, { frame_count: 4, size_bytes: 100, capacity_bytes: 900 }));
  it("pide la ruta y la cabecera correctas y normaliza la respuesta", async () => {
    expect(await estado("personalidad-aurora-2026T4.mv2e", { ...OPS, fetchImpl: f as unknown as typeof fetch }))
      .toEqual({ fotogramas: 4, bytes: 100, tope: 900, queda: 800 });
    expect(f.mock.calls[0]?.[0]).toBe("http://127.0.0.1:4490/capsulas/personalidad-aurora-2026T4.mv2e/estado");
    const init = f.mock.calls[0]?.[1];
    expect(init?.headers).toEqual({ "X-StarSeed-Token": "prueba" });
  });
  it("nombre raro no llama; un 404 o un servidor muerto son null, nunca un lanzamiento", async () => {
    expect(await estado("x/y.mv2", { ...OPS, fetchImpl: f as unknown as typeof fetch })).toBeNull();
    await expect(estado("a.mv2", { ...OPS, fetchImpl: async () => RESPUESTA(404, {}) })).resolves.toBeNull();
    await expect(estado("a.mv2", { ...OPS, fetchImpl: async () => { throw new TypeError("fetch failed"); } }))
      .resolves.toBeNull();
  });
});

describe("buscar · POST /capsulas/<nombre>/buscar", () => {
  it("manda consulta y k podado; consulta vacía no llama", async () => {
    const f = vi.fn<FetchFalso>(async () => RESPUESTA(200, { aciertos: [{ texto: "hay" }] }));
    expect(await buscar("a.mv2", "ondas", 999, { ...OPS, fetchImpl: f as unknown as typeof fetch }))
      .toEqual([expect.objectContaining({ texto: "hay" })]);
    const llamada = f.mock.calls[0];
    expect(llamada?.[0]).toBe("http://127.0.0.1:4490/capsulas/a.mv2/buscar");
    expect(JSON.parse(String(llamada?.[1]?.body))).toEqual({ consulta: "ondas", k: 50 });
    expect(await buscar("a.mv2", "   ", 5, { ...OPS, fetchImpl: f as unknown as typeof fetch })).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("sin servidor, null y sin aciertos", async () => {
    const f = vi.fn<FetchFalso>(async () => { throw new TypeError("fetch failed"); });
    expect(await buscar("a.mv2", "x", 5, { ...OPS, fetchImpl: f as unknown as typeof fetch })).toBeNull();
  });
});

describe("línea del tiempo y salud", () => {
  it("linea manda desde/hasta en la cadena de consulta y usa el JSON que venga", async () => {
    const f = vi.fn<FetchFalso>(async () => RESPUESTA(200, { linea: [] }));
    expect(await linea("a.mv2", 10, 20, { ...OPS, fetchImpl: f as unknown as typeof fetch })).toEqual([]);
    expect(f.mock.calls[0]?.[0]).toBe("http://127.0.0.1:4490/capsulas/a.mv2/linea?desde=10&hasta=20");
    expect(await linea("a.mv2", 10, 20, { ...OPS, fetchImpl: async () => RESPUESTA(500, {}) })).toBeNull();
  });
  it("salud: 200 es vivo; caído o 404, falso", async () => {
    expect(await salud({ ...OPS, fetchImpl: async () => RESPUESTA(200, { ok: true }) })).toBe(true);
    expect(await salud({ ...OPS, fetchImpl: async () => { throw new Error(); } })).toBe(false);
    expect(await salud({ ...OPS, fetchImpl: async () => RESPUESTA(404, {}) })).toBe(false);
  });
});

describe("poner · añade, y con 507 abre la parte siguiente y reintenta una vez", () => {
  constSUJETO = { tipo: "personalidad", id: "aurora" } as const;
  const opciones = (f: FetchFalso): OpcionesMemvid => ({ ...OPS, fetchImpl: f as unknown as typeof fetch });
  it("escribe en la cápsula del trimestre con su cuerpo completo", async () => {
    const f = vi.fn<FetchFalso>(async () => RESPUESTA(200, { frame: 7 }));
    const r = await poner(SUJETO, "hoy probé la década", { ...opciones(f), titulo: "década", ts: 20 });
    expect(r).toEqual({ nombre: "personalidad-aurora-2026T4.mv2e", parte: 1, frame: 7 });
    expect(JSON.parse(String(f.mock.calls[0]?.[1]?.body))).toEqual({
      texto: "hoy probé la década", titulo: "década", uri: undefined, etiquetas: undefined, ts: 20,
    });
  });
  it("507 llena la parte: segunda llamada a -2026T4b y resultado con parte 2", async () => {
    const f = vi.fn<FetchFalso>(async (url) =>
      String(url).endsWith("2026T4b.mv2e/poner") ? RESPUESTA(200, { frame: 1 }) : RESPUESTA(507, {}));
    const r = await poner(SUJETO, "seguimos", opciones(f));
    expect(f).toHaveBeenCalledTimes(2);
    expect(f.mock.calls[1]?.[0]).toBe("http://127.0.0.1:4490/capsulas/personalidad-aurora-2026T4b.mv2e/poner");
    expect(r).toEqual({ nombre: "personalidad-aurora-2026T4b.mv2e", parte: 2, frame: 1 });
  });
  it("sin servidor, texto vacío o parte 27: null sin lanzar ni mentir", async () => {
    const f = vi.fn<FetchFalso>(async () => { throw new TypeError("fetch failed"); });
    expect(await poner(SUJETO, "hola", opciones(f))).toBeNull();
    expect(await poner(SUJETO, "   ", opciones(f))).toBeNull();
    expect(f).toHaveBeenCalledTimes(0);
    const llena = vi.fn<FetchFalso>(async () => RESPUESTA(507, {})); // parte 27 ya no existe → sin reintento
    expect(await poner(SUJETO, "hola", { ...opciones(llena), parte: 27 })).toBeNull();
    expect(llena).toHaveBeenCalledTimes(0);
  });
});



