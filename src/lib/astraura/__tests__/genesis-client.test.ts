/**
 * Tests de `genesis-client.ts`.
 *
 * Dos capas, como el propio fichero:
 *   1. Lógica PURA (`asGenesisList`, `unwrapEnvelope`) — sin red, sin mocks.
 *   2. El transporte real, con un DOBLE de `fetch` en memoria y el mismo
 *      truco de `astraura-158-ws.test.ts` para simular "estamos en el
 *      navegador" (la guardia SSR mira `typeof window`). Cubre exactamente
 *      lo que pide la tarea: un backend viejo (404), uno roto (JSON
 *      inesperado), uno lento (timeout) y uno de verdad (200) — ninguno
 *      debe lanzar una excepción sin capturar hacia la UI.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  acceptGenesisPropuesta,
  asGenesisList,
  createGenesisSer,
  deleteGenesisSer,
  discardGenesisPropuesta,
  fetchGenesisModelos,
  fetchGenesisSer,
  fetchGenesisSeres,
  unwrapEnvelope,
  updateGenesisSer,
  verifyGenesisModelo,
  type GenesisResponse,
} from "@/lib/astraura/genesis-client";
import type { Ser, SerListado, SolicitudGenesis } from "@/lib/astraura/genesis-types";
import { SOBERANIA_POR_DEFECTO, ENRUTADO_POR_DEFECTO } from "@/lib/astraura/genesis-types";

/* ─────────────────────────── Lógica pura ─────────────────────────── */

describe("asGenesisList", () => {
  it("un array pasa tal cual", () => {
    expect(asGenesisList<number>([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it("cualquier otra forma (backend viejo, null, objeto suelto) ⇒ lista vacía, nunca revienta", () => {
    expect(asGenesisList(null)).toEqual([]);
    expect(asGenesisList(undefined)).toEqual([]);
    expect(asGenesisList({ seres: [1, 2] })).toEqual([]);
    expect(asGenesisList("no es una lista")).toEqual([]);
    expect(asGenesisList(42)).toEqual([]);
  });
});

describe("unwrapEnvelope", () => {
  const base = { target: "local" as const, endpoint: "http://x" };

  it("ok:false en el transporte se propaga tal cual (nunca llega a mirar el cuerpo)", () => {
    const failure: GenesisResponse<{ ok?: boolean }> = { ok: false, error: "sin respuesta (timeout)", ...base };
    expect(unwrapEnvelope(failure, () => ({}))).toBe(failure);
  });

  it("cuerpo con ok:false ⇒ fallo con el mensaje del backend", () => {
    const r: GenesisResponse<{ ok?: boolean; ser?: Ser; error?: string }> = { ok: true, data: { ok: false, error: "nombre duplicado" }, ...base };
    const out = unwrapEnvelope(r, (b) => b.ser);
    expect(out).toEqual({ ok: false, error: "nombre duplicado", ...base });
  });

  it("cuerpo con ok:false sin `error` cae a `message`, y sin ninguno de los dos a una frase genérica", () => {
    const withMessage = unwrapEnvelope<{ ok?: boolean; message?: string }, unknown>({ ok: true, data: { ok: false, message: "cupo agotado" }, ...base }, () => ({}));
    expect(withMessage).toMatchObject({ ok: false, error: "cupo agotado" });
    const withNeither = unwrapEnvelope<{ ok?: boolean }, unknown>({ ok: true, data: { ok: false }, ...base }, () => ({}));
    expect(withNeither).toMatchObject({ ok: false, error: "el backend rechazó la acción" });
  });

  it("ok:true pero sin el campo esperado ⇒ fallo explícito, no `data: undefined` colado", () => {
    const r: GenesisResponse<{ ok?: boolean; ser?: Ser }> = { ok: true, data: { ok: true }, ...base };
    const out = unwrapEnvelope(r, (b) => b.ser);
    expect(out).toEqual({ ok: false, error: "el backend respondió sin los datos esperados", ...base });
  });

  it("éxito: extrae el campo pedido", () => {
    const ser = { id: "s1", nombre: "Aurora" } as Ser;
    const r: GenesisResponse<{ ok?: boolean; ser?: Ser }> = { ok: true, data: { ok: true, ser }, ...base };
    expect(unwrapEnvelope(r, (b) => b.ser)).toEqual({ ok: true, data: ser, ...base });
  });

  it("un backend viejo que ni siquiera manda `ok` (200 + el campo pelado) también cuenta como éxito", () => {
    const ser = { id: "s1", nombre: "Aurora" } as Ser;
    const r: GenesisResponse<{ ok?: boolean; ser?: Ser }> = { ok: true, data: { ser }, ...base };
    expect(unwrapEnvelope(r, (b) => b.ser)).toEqual({ ok: true, data: ser, ...base });
  });
});

/* ─────────────────────── Transporte (fetch simulado) ─────────────────────── */

function fakeResponse(status: number, body: unknown, opts?: { brokenJson?: boolean }): Response {
  const text = body === undefined ? "" : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (opts?.brokenJson) throw new SyntaxError("Unexpected token");
      return body;
    },
    text: async () => text,
  } as unknown as Response;
}

/** `fetch` que nunca resuelve por sí solo, pero respeta `AbortSignal` como el real. */
function stalledFetch(): ReturnType<typeof vi.fn> {
  return vi.fn((_url: string, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")));
    });
  });
}

const realWindow = (globalThis as unknown as { window?: unknown }).window;

beforeEach(() => {
  // Simula "estamos en el navegador": la guardia SSR de `call()` mira `typeof window`.
  (globalThis as unknown as { window: unknown }).window = globalThis;
});

afterEach(() => {
  (globalThis as unknown as { window?: unknown }).window = realWindow;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("guardia SSR", () => {
  it("sin `window` (SSR real) devuelve un fallo limpio y NUNCA llama a fetch", async () => {
    (globalThis as unknown as { window?: unknown }).window = undefined;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const r = await fetchGenesisSeres("local");
    expect(r).toMatchObject({ ok: false, error: "SSR" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("backend viejo o roto", () => {
  it("404 (el backend no tiene Génesis todavía) ⇒ mensaje reconocible, no un HTTP genérico", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(404, { detail: "Not Found" })));
    const r = await fetchGenesisSeres("local");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/no tiene Génesis.*404/);
  });

  it("500 con detalle JSON ⇒ el detalle viaja en el mensaje (recortado)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(500, { error: "índice corrupto" })));
    const r = await fetchGenesisSeres("local");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("HTTP 500: índice corrupto");
  });

  it("500 con cuerpo no-JSON ⇒ igual degrada limpio, sin colgarse en el parseo", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(500, undefined, { brokenJson: true })));
    const r = await fetchGenesisSeres("local");
    expect(r).toMatchObject({ ok: false, error: "HTTP 500" });
  });

  it("fetch que lanza (red caída, DNS, CORS…) ⇒ nunca escapa como excepción, se captura", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    await expect(fetchGenesisSeres("local")).resolves.toMatchObject({ ok: false, error: "Failed to fetch" });
  });

  it("200 con un cuerpo que no es un array (listado) ⇒ se degrada a lista vacía, no revienta la UI", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(200, { seres: ["algo"] })));
    const r = await fetchGenesisSeres("local");
    expect(r).toMatchObject({ ok: true, data: [] });
  });

  it("timeout: si el backend no contesta, se aborta y llega un error legible, no una promesa colgada para siempre", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", stalledFetch());
    const promise = fetchGenesisSeres("local");
    await vi.advanceTimersByTimeAsync(4_001); // shortTimeoutMs("local") = 4000ms
    await expect(promise).resolves.toMatchObject({ ok: false, error: "sin respuesta (timeout)" });
  });

  it("las acciones pesadas (crear un ser) tienen más margen que las de lectura antes de abortar", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", stalledFetch());
    const solicitud: SolicitudGenesis = { nombre: "Nébula" };
    const promise = createGenesisSer("local", solicitud);
    // Justo pasado el timeout CORTO (4000ms): una llamada de lectura ya habría abortado aquí, esta no.
    await vi.advanceTimersByTimeAsync(4_001);
    expect(vi.getTimerCount()).toBeGreaterThan(0); // sigue habiendo un timeout pendiente: no abortó todavía.
    await vi.advanceTimersByTimeAsync(30_000); // shortTimeoutMs + heavyTimeoutMs("local") de sobra.
    await expect(promise).resolves.toMatchObject({ ok: false, error: "sin respuesta (timeout)" });
  });
});

describe("camino feliz — forma exacta de la petición y de la respuesta", () => {
  it("fetchGenesisSer codifica el id en la URL y devuelve el ser tal cual (sin sobre)", async () => {
    const ser = { id: "ser con espacio", nombre: "Aurora" } as Ser;
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => fakeResponse(200, ser));
    vi.stubGlobal("fetch", fetchMock);
    const r = await fetchGenesisSer("local", "ser con espacio");
    expect(r).toMatchObject({ ok: true, data: ser });
    expect(fetchMock.mock.calls[0][0]).toContain(encodeURIComponent("ser con espacio"));
  });

  it("createGenesisSer manda POST + JSON + Content-Type, y desenvuelve `{ok, ser}`", async () => {
    const ser = { id: "s2", nombre: "Nébula" } as Ser;
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => fakeResponse(200, { ok: true, ser }));
    vi.stubGlobal("fetch", fetchMock);
    const solicitud: SolicitudGenesis = {
      nombre: "Nébula",
      soberania: { ...SOBERANIA_POR_DEFECTO },
      enrutado: { ...ENRUTADO_POR_DEFECTO },
    };
    const r = await createGenesisSer("local", solicitud);
    expect(r).toMatchObject({ ok: true, data: ser });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(JSON.parse(String(init.body))).toEqual(solicitud);
  });

  it("updateGenesisSer manda PATCH con solo el parche, y propaga el rechazo del backend cuando lo hay", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => fakeResponse(200, { ok: false, error: "estado inválido" }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await updateGenesisSer("local", "s1", { estado: "durmiendo" });
    expect(r).toMatchObject({ ok: false, error: "estado inválido" });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual({ estado: "durmiendo" });
  });

  it("deleteGenesisSer, acceptGenesisPropuesta y discardGenesisPropuesta aceptan un cuerpo vacío como éxito", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(200, undefined)));
    await expect(deleteGenesisSer("local", "s1")).resolves.toMatchObject({ ok: true, data: { ok: true } });
    await expect(acceptGenesisPropuesta("local", "p1")).resolves.toMatchObject({ ok: true, data: { ok: true } });
    await expect(discardGenesisPropuesta("local", "p1")).resolves.toMatchObject({ ok: true, data: { ok: true } });
  });

  it("fetchGenesisModelos devuelve la escalera tal cual llega (sin sobre, es una lista directa)", async () => {
    const modelos = [{ id: "m1", etiqueta: "Free", proveedor: "openrouter-gratis", costePorMillon: 0, verificado: false }];
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(200, modelos)));
    await expect(fetchGenesisModelos("local")).resolves.toMatchObject({ ok: true, data: modelos });
  });

  it("verifyGenesisModelo manda el id del modelo tal cual (camelCase, el contrato de Génesis es propio) y no lo envuelve en `{ok,...}`", async () => {
    const veredicto = { modeloId: "m1", responde: true, latenciaMs: 480, muestra: "hola", error: null };
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => fakeResponse(200, veredicto));
    vi.stubGlobal("fetch", fetchMock);
    const r = await verifyGenesisModelo("local", "m1");
    expect(r).toMatchObject({ ok: true, data: veredicto });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ modeloId: "m1" });
  });

  it("target 'nube' resuelve contra otro endpoint que 'local' (mismo mecanismo que astraura-158-client.ts)", async () => {
    const fetchMock = vi.fn(async () => fakeResponse(200, [] as SerListado[]));
    vi.stubGlobal("fetch", fetchMock);
    const rLocal = await fetchGenesisSeres("local");
    const rNube = await fetchGenesisSeres("nube");
    expect(rLocal.endpoint).not.toBe(rNube.endpoint);
  });
});
