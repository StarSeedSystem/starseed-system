/**
 * Tests de `genesis-client-ola2.ts`.
 *
 * Mismo esquema que `genesis-client.test.ts`: un backend viejo (404), uno
 * roto (JSON inesperado / forma inesperada), uno lento (timeout) y uno de
 * verdad (200) para cada endpoint nuevo de OLA 2 — ninguno debe lanzar una
 * excepción sin capturar hacia la UI. El doble de `fetch` y el truco de
 * `window` son los mismos que usa el resto del OS para simular "estamos en
 * el navegador" (la guardia SSR de `call()` mira `typeof window`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  depositGenesisBibliotecaUsuario,
  deleteGenesisSerCerebro,
  fetchGenesisBotsPredeterminados,
  fetchGenesisHerramientas,
  fetchGenesisOficina,
  installGenesisBotsPredeterminados,
  searchGenesisSerAvatar,
  setGenesisSerAvatar,
  syncGenesisCerebros,
  syncGenesisSerCerebro,
  updateGenesisSerCerebros,
  updateGenesisSerInternet,
} from "@/lib/astraura/genesis-client-ola2";
import type {
  BotPredeterminado, CerebroSer, EstadoOficina, FuenteAvatar, HerramientaDisponible, PaqueteBibliotecaUsuario, ResultadoSincronizacion, Ser,
} from "@/lib/astraura/genesis-types";

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
  (globalThis as unknown as { window: unknown }).window = globalThis;
});

afterEach(() => {
  (globalThis as unknown as { window?: unknown }).window = realWindow;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/* ─────────────────────────── Guardia SSR ─────────────────────────── */

describe("guardia SSR", () => {
  it("sin `window` (SSR real) devuelve un fallo limpio y NUNCA llama a fetch", async () => {
    (globalThis as unknown as { window?: unknown }).window = undefined;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const r = await fetchGenesisOficina("local");
    expect(r).toMatchObject({ ok: false, error: "SSR" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/* ─────────────────────── Backend viejo, roto o lento ─────────────────────── */

describe("backend viejo, roto o lento", () => {
  it("404 ⇒ mensaje reconocible propio de OLA 2, no un HTTP genérico ni un 'sin conexión'", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(404, { detail: "Not Found" })));
    const r = await fetchGenesisHerramientas("local");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/todavía no tiene esta función de OLA 2.*404/);
  });

  it("500 con detalle JSON ⇒ el detalle viaja en el mensaje", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(500, { error: "índice corrupto" })));
    const r = await fetchGenesisBotsPredeterminados("local");
    expect(r).toMatchObject({ ok: false, error: "HTTP 500: índice corrupto" });
  });

  it("500 con cuerpo no-JSON ⇒ degrada limpio, sin colgarse en el parseo", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(500, undefined, { brokenJson: true })));
    const r = await fetchGenesisOficina("local");
    expect(r).toMatchObject({ ok: false, error: "HTTP 500" });
  });

  it("fetch que lanza (red caída, DNS, CORS…) ⇒ nunca escapa como excepción", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    await expect(fetchGenesisHerramientas("local")).resolves.toMatchObject({ ok: false, error: "Failed to fetch" });
  });

  it("200 con un cuerpo que no es un array (listado) ⇒ se degrada a lista vacía, no revienta la UI", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(200, { herramientas: ["algo"] })));
    const r = await fetchGenesisHerramientas("local");
    expect(r).toMatchObject({ ok: true, data: [] });
  });

  it("timeout de lectura (oficina/bots/herramientas): se aborta y llega un error legible, no una promesa colgada", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", stalledFetch());
    const promise = fetchGenesisOficina("local");
    await vi.advanceTimersByTimeAsync(4_001); // shortTimeoutMs("local") = 4000ms
    await expect(promise).resolves.toMatchObject({ ok: false, error: "sin respuesta (timeout)" });
  });

  it("las acciones pesadas (instalar bots, configurar internet) tienen más margen que las de lectura antes de abortar", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", stalledFetch());
    const promise = updateGenesisSerInternet("local", "s1", { activa: true });
    await vi.advanceTimersByTimeAsync(4_001); // pasado el timeout CORTO: una lectura ya habría abortado, esta no.
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    await vi.advanceTimersByTimeAsync(30_000); // shortTimeoutMs + heavyTimeoutMs("local") de sobra.
    await expect(promise).resolves.toMatchObject({ ok: false, error: "sin respuesta (timeout)" });
  });
});

/* ─────────────────────── Sobre {ok, ...} de las mutaciones ─────────────────────── */

describe("sobre {ok,...} de las mutaciones sobre un ser", () => {
  it("updateGenesisSerInternet propaga el rechazo del backend cuando `ok:false`", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(200, { ok: false, error: "dominio inválido en la lista de permitidos" })));
    const r = await updateGenesisSerInternet("local", "s1", { web: true });
    expect(r).toMatchObject({ ok: false, error: "dominio inválido en la lista de permitidos" });
  });

  it("updateGenesisSerInternet: ok:true sin `ser` ⇒ fallo explícito, nunca `data: undefined` colado", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(200, { ok: true })));
    const r = await updateGenesisSerInternet("local", "s1", { web: true });
    expect(r).toMatchObject({ ok: false, error: "el backend respondió sin los datos esperados" });
  });

  it("searchGenesisSerAvatar: `candidatos` que no es un array ⇒ fallo explícito (forma inesperada), no una lista vacía silenciosa", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(200, { ok: true, candidatos: "no es una lista" })));
    const r = await searchGenesisSerAvatar("local", "s1", "retrato futurista");
    expect(r).toMatchObject({ ok: false, error: "el backend respondió sin los datos esperados" });
  });

  it("installGenesisBotsPredeterminados: `creados` ausente del todo ⇒ también fallo explícito", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(200, { ok: true })));
    const r = await installGenesisBotsPredeterminados("local");
    expect(r).toMatchObject({ ok: false, error: "el backend respondió sin los datos esperados" });
  });
});

/* ─────────────────────── Camino feliz — forma exacta de cada endpoint ─────────────────────── */

describe("camino feliz — forma exacta de la petición y de la respuesta", () => {
  it("fetchGenesisOficina: GET sin cuerpo, devuelve el objeto tal cual (sin sobre)", async () => {
    const oficina: EstadoOficina = { salas: [], ocupantes: [], actualizadoEn: 1000, datosReales: false };
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => fakeResponse(200, oficina));
    vi.stubGlobal("fetch", fetchMock);
    const r = await fetchGenesisOficina("local");
    expect(r).toMatchObject({ ok: true, data: oficina });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toContain("/api/genesis/oficina");
    expect(init?.method ?? "GET").toBe("GET");
  });

  it("fetchGenesisBotsPredeterminados: lista directa, sin sobre", async () => {
    const bots: BotPredeterminado[] = [{ id: "b1", nombre: "Curiosidad", rol: "explorador", procesoTipoId: "curiosidad", instalado: false }];
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(200, bots)));
    await expect(fetchGenesisBotsPredeterminados("local")).resolves.toMatchObject({ ok: true, data: bots });
  });

  it("installGenesisBotsPredeterminados SIN ids: manda `{}` (el backend decide instalar todo lo que falte)", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => fakeResponse(200, { ok: true, creados: ["b1", "b2"] }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await installGenesisBotsPredeterminados("local");
    expect(r).toMatchObject({ ok: true, data: ["b1", "b2"] });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/genesis/bots_predeterminados/instalar");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({});
  });

  it("installGenesisBotsPredeterminados CON ids: manda exactamente esos, ni uno más", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => fakeResponse(200, { ok: true, creados: ["b3"] }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await installGenesisBotsPredeterminados("local", ["b3"]);
    expect(r).toMatchObject({ ok: true, data: ["b3"] });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ ids: ["b3"] });
  });

  it("fetchGenesisHerramientas: lista directa, sin sobre", async () => {
    const lista: HerramientaDisponible[] = [{ id: "h1", nombre: "Buscar en la biblioteca", fuente: "biblioteca-os", disponible: true }];
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(200, lista)));
    await expect(fetchGenesisHerramientas("local")).resolves.toMatchObject({ ok: true, data: lista });
  });

  it("updateGenesisSerInternet: POST al ser correcto (id codificado), manda el parche tal cual y desenvuelve `ser`", async () => {
    const ser = { id: "s con espacio", internet: { activa: true } } as unknown as Ser;
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => fakeResponse(200, { ok: true, ser }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await updateGenesisSerInternet("local", "s con espacio", { activa: true, web: false });
    expect(r).toMatchObject({ ok: true, data: ser });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(encodeURIComponent("s con espacio"));
    expect(url).toContain("/internet");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ activa: true, web: false });
  });

  it("searchGenesisSerAvatar: manda `{consulta}` y desenvuelve `candidatos`", async () => {
    const candidatos: FuenteAvatar[] = [{ modo: "enlinea", url: "https://ejemplo/x.png", consulta: "búho cósmico", proveedor: "unsplash" }];
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => fakeResponse(200, { ok: true, candidatos }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await searchGenesisSerAvatar("local", "s1", "búho cósmico");
    expect(r).toMatchObject({ ok: true, data: candidatos });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/avatar/buscar");
    expect(JSON.parse(String(init.body))).toEqual({ consulta: "búho cósmico" });
  });

  it("setGenesisSerAvatar: manda la fuente elegida tal cual y desenvuelve `ser`", async () => {
    const fuente: FuenteAvatar = { modo: "subido", url: "https://ejemplo/foto.png", licencia: "propia" };
    const ser = { id: "s1", avatarFuente: fuente } as unknown as Ser;
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => fakeResponse(200, { ok: true, ser }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await setGenesisSerAvatar("local", "s1", fuente);
    expect(r).toMatchObject({ ok: true, data: ser });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url.endsWith("/avatar")).toBe(true);
    expect(JSON.parse(String(init.body))).toEqual(fuente);
  });

  it("updateGenesisSerCerebros: manda `{cerebrosPropios}` (array completo) y desenvuelve `ser`", async () => {
    const cerebros: CerebroSer[] = [{ id: "c1", nombre: "Memoria larga", sincronizable: true, estadoSync: "fallo", errorSync: "handshake TLS" }];
    const ser = { id: "s1", cerebrosPropios: cerebros } as unknown as Ser;
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => fakeResponse(200, { ok: true, ser }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await updateGenesisSerCerebros("local", "s1", cerebros);
    expect(r).toMatchObject({ ok: true, data: ser });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/cerebros");
    expect(JSON.parse(String(init.body))).toEqual({ cerebrosPropios: cerebros });
  });

  it("target 'nube' resuelve contra otro endpoint que 'local' (mismo mecanismo que genesis-client.ts)", async () => {
    const fetchMock = vi.fn(async () => fakeResponse(200, [] as HerramientaDisponible[]));
    vi.stubGlobal("fetch", fetchMock);
    const rLocal = await fetchGenesisHerramientas("local");
    const rNube = await fetchGenesisHerramientas("nube");
    expect(rLocal.endpoint).not.toBe(rNube.endpoint);
  });
});

/* ═══════════════ Cierre de deudas: biblioteca del usuario + sync de cerebros ═══════════════ */

describe("depositGenesisBibliotecaUsuario", () => {
  it("manda {paquetes} tal cual al endpoint correcto y desenvuelve {recibidos,descartados}", async () => {
    const paquetes: PaqueteBibliotecaUsuario[] = [
      { id: "p1", kind: "function", name: "Traductor", description: "traduce texto" },
      { id: "p2", name: "Widget reloj" },
    ];
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => fakeResponse(200, { ok: true, recibidos: 2, descartados: 0 }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await depositGenesisBibliotecaUsuario("local", paquetes);
    expect(r).toMatchObject({ ok: true, data: { recibidos: 2, descartados: 0 } });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/genesis/herramientas/biblioteca_usuario");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ paquetes });
  });

  it("descartados ausente en una respuesta ok ⇒ se completa a 0, nunca undefined", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(200, { ok: true, recibidos: 3 })));
    const r = await depositGenesisBibliotecaUsuario("local", []);
    expect(r).toMatchObject({ ok: true, data: { recibidos: 3, descartados: 0 } });
  });

  it("recibidos ausente o no-numérico ⇒ fallo explícito, nunca un éxito sin los datos que lo prueban", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(200, { ok: true })));
    const r = await depositGenesisBibliotecaUsuario("local", []);
    expect(r).toMatchObject({ ok: false, error: "el backend respondió sin los datos esperados" });
  });

  it("el backend rechaza el depósito (ok:false) ⇒ se propaga el motivo real", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(200, { ok: false, error: "paquete sin nombre" })));
    const r = await depositGenesisBibliotecaUsuario("local", [{ id: "x", name: "" }]);
    expect(r).toMatchObject({ ok: false, error: "paquete sin nombre" });
  });

  it("404 (backend sin este endpoint todavía) ⇒ mensaje reconocible de OLA 2, no un HTTP genérico", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(404, { detail: "Not Found" })));
    const r = await depositGenesisBibliotecaUsuario("local", []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/todavía no tiene esta función de OLA 2.*404/);
  });
});

describe("syncGenesisCerebros (todos)", () => {
  it("POST sin body real ({}) al endpoint global, y desenvuelve `resultado`", async () => {
    const resultado: ResultadoSincronizacion = {
      ok: true,
      vias: [{ medio: "supabase", ok: true }, { medio: "r2", ok: false, error: "handshake TLS falló" }],
      cerebrosTocados: 4,
      en: 1000,
    };
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => fakeResponse(200, { ok: true, resultado }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await syncGenesisCerebros("local");
    expect(r).toMatchObject({ ok: true, data: resultado });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/genesis/cerebros/sincronizar");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({});
  });

  it("una vía que falla no esconde el resultado global: `vias` viaja completo, fallo incluido", async () => {
    const resultado: ResultadoSincronizacion = { ok: true, vias: [{ medio: "r2", ok: false, error: "handshake TLS" }], cerebrosTocados: 1, en: 1 };
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(200, { ok: true, resultado })));
    const r = await syncGenesisCerebros("local");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.vias).toEqual([{ medio: "r2", ok: false, error: "handshake TLS" }]);
  });

  it("ok:true sin `resultado` ⇒ fallo explícito", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(200, { ok: true })));
    const r = await syncGenesisCerebros("local");
    expect(r).toMatchObject({ ok: false, error: "el backend respondió sin los datos esperados" });
  });

  it("timeout: usa el margen LARGO (acción real de red hacia R2/Supabase), no el corto de lectura", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", stalledFetch());
    const promise = syncGenesisCerebros("local");
    await vi.advanceTimersByTimeAsync(4_001); // shortTimeoutMs ya habría abortado una lectura; esto no debe hacerlo aún
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    await vi.advanceTimersByTimeAsync(30_000);
    await expect(promise).resolves.toMatchObject({ ok: false, error: "sin respuesta (timeout)" });
  });
});

describe("syncGenesisSerCerebro (uno)", () => {
  it("POST a .../seres/{id}/cerebros/{cerebro_id}/sincronizar (ids codificados) y desenvuelve `ser`", async () => {
    const ser = { id: "s con espacio", cerebrosPropios: [{ id: "c1", nombre: "Memoria", sincronizable: true, estadoSync: "ok" }] } as unknown as Ser;
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => fakeResponse(200, { ok: true, ser }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await syncGenesisSerCerebro("local", "s con espacio", "c1");
    expect(r).toMatchObject({ ok: true, data: ser });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(encodeURIComponent("s con espacio"));
    expect(url).toContain("/cerebros/c1/sincronizar");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({});
  });

  it("el ser vuelve con un cerebro en estado 'fallo' real (éxito por Supabase, R2 roto) — no se limpia, se propaga tal cual", async () => {
    const ser = {
      id: "s1",
      cerebrosPropios: [{ id: "c1", nombre: "Memoria", sincronizable: true, estadoSync: "ok", vias: [{ medio: "supabase", ok: true }, { medio: "r2", ok: false, error: "handshake TLS falló contra R2" }] }],
    } as unknown as Ser;
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(200, { ok: true, ser })));
    const r = await syncGenesisSerCerebro("local", "s1", "c1");
    expect(r.ok).toBe(true);
    if (r.ok) {
      const c = (r.data as unknown as { cerebrosPropios: CerebroSer[] }).cerebrosPropios[0];
      expect(c.vias).toEqual([{ medio: "supabase", ok: true }, { medio: "r2", ok: false, error: "handshake TLS falló contra R2" }]);
    }
  });

  it("ok:false del backend se propaga sin disfraz", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(200, { ok: false, error: "cerebro no encontrado" })));
    const r = await syncGenesisSerCerebro("local", "s1", "no-existe");
    expect(r).toMatchObject({ ok: false, error: "cerebro no encontrado" });
  });
});

describe("deleteGenesisSerCerebro", () => {
  it("DELETE a .../seres/{id}/cerebros/{cerebro_id} (sin /sincronizar) y desenvuelve un ack simple", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => fakeResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await deleteGenesisSerCerebro("local", "s1", "c1");
    expect(r).toMatchObject({ ok: true, data: { ok: true } });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url.endsWith("/api/genesis/seres/s1/cerebros/c1")).toBe(true);
    expect(init.method).toBe("DELETE");
  });

  it("el backend rechaza el borrado (ok:false) ⇒ nunca se lee como éxito", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(200, { ok: false, error: "cerebro protegido por soberanía" })));
    const r = await deleteGenesisSerCerebro("local", "s1", "c1");
    expect(r).toMatchObject({ ok: false, error: "cerebro protegido por soberanía" });
  });

  it("cuerpo vacío (204-like) tras un DELETE con éxito no revienta el parseo", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(200, undefined)));
    const r = await deleteGenesisSerCerebro("local", "s1", "c1");
    // {} sin `ok` explícito no es un fallo declarado por el backend, así que unwrapAck lo trata como éxito del ack.
    expect(r).toMatchObject({ ok: true, data: { ok: true } });
  });
});
