import { afterEach, describe, expect, it, vi } from "vitest";
import { crearClienteChatsGenesis, type FetchLike } from "../puerta-chats";
import { crearPuertaA1, type PuertaA1 } from "@/lib/datos/puerta-a1";
import { CLAVE_COLA, leerCola, type AlmacenPuerta } from "@/lib/datos/puerta-a1-tipos";
import { RE_NONCE, type EntradaChat } from "../tipos";

const BASE = "https://puerta.prueba";
const JWT = "jwt-de-prueba";

function almacen(): AlmacenPuerta & { datos: Map<string, string> } {
    const datos = new Map<string, string>();
    return { datos, getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => void datos.set(k, v), removeItem: (k) => void datos.delete(k) };
}

function respuesta(estado: number, cuerpo: unknown): Response {
    return new Response(JSON.stringify(cuerpo), { status: estado, headers: { "content-type": "application/json" } });
}

/** Puerta de mentira: solo lo que usa el cliente. */
function puertaFalsa(modo: "auto" | "apagada" = "auto") {
    const operar = vi.fn(async (_o: unknown): Promise<{ via: string; datos: unknown; error?: string }> => ({ via: "puerta", datos: { acuses: [] } }));
    return { puerta: { modo: () => modo, configurada: async () => true, operar } as unknown as PuertaA1, operar };
}

function cliente(fetch: FetchLike, extra: Partial<Parameters<typeof crearClienteChatsGenesis>[0]> = {}) {
    const { puerta, operar } = puertaFalsa();
    const c = crearClienteChatsGenesis({ puerta, fetch, url: async () => BASE, sesion: async () => JWT, ahora: () => Date.parse("2026-11-13T10:00:00.000Z"), ...extra });
    return { c, operar };
}

const decir: Omit<EntradaChat, "v" | "nonce" | "t"> = { fuente: "direccion", accion: "decir", texto: "Prueba GEN1113 desde el móvil", modelo: "director-presidente/auto", canales: ["director-presidente"] };

afterEach(() => {
    vi.useRealTimers();
});

describe("enviar · directo a la puerta, nunca a la cola local", () => {
    it("manda una entrada v1 con nonce de 128 bits, sesión y sin cookies; devuelve el id", async () => {
        const fetch = vi.fn<FetchLike>(async () => respuesta(201, { id: 42, destino: "mac", estado: "en-cola" }));
        const { c } = cliente(fetch);
        expect(await c.enviar({ ...decir, cuenta: "otra", rol: "dueño" } as typeof decir)).toEqual({ ok: true, id: 42 });
        expect(fetch).toHaveBeenCalledTimes(1);
        const [url, init] = fetch.mock.calls[0];
        expect(url).toBe(`${BASE}/v1/genesis/chats/entrada`);
        expect(init).toMatchObject({ method: "POST", credentials: "omit", cache: "no-store" });
        expect((init!.headers as Record<string, string>).authorization).toBe(`Bearer ${JWT}`);
        const cuerpo = JSON.parse(String(init!.body));
        expect(cuerpo).toMatchObject({ v: 1, t: "2026-11-13T10:00:00.000Z", ...decir });
        expect(cuerpo.nonce).toMatch(RE_NONCE);
        expect(cuerpo).not.toHaveProperty("cuenta");
        expect(cuerpo).not.toHaveProperty("rol");
    });

    it("cada envío lleva un nonce distinto", async () => {
        const nonces = new Set<string>();
        const fetch = vi.fn<FetchLike>(async (_u, init) => (nonces.add(JSON.parse(String(init!.body)).nonce), respuesta(201, { id: 1 })));
        const { c } = cliente(fetch);
        for (let i = 0; i < 20; i++) await c.enviar(decir);
        expect(nonces.size).toBe(20);
    });

    it("con la puerta caída, 5xx o 429: ok:false, una sola petición y la cola del adaptador vacía", async () => {
        const a = almacen();
        const salidas: (() => Promise<Response>)[] = [
            async () => { throw new TypeError("Failed to fetch"); },
            async () => respuesta(503, { error: "rol sin comprobar" }),
            async () => respuesta(500, {}),
            async () => respuesta(502, "x"),
            async () => respuesta(429, { error: "límite" }),
        ];
        for (const salida of salidas) {
            const fetch = vi.fn<FetchLike>(salida);
            // El adaptador de verdad, con su cola en el mismo almacén: no debe recibir nada.
            const puerta = crearPuertaA1({ fetch, almacen: a, url: BASE, sesion: async () => JWT });
            const operar = vi.spyOn(puerta, "operar");
            const c = crearClienteChatsGenesis({ puerta, fetch, url: async () => BASE, sesion: async () => JWT });
            const r = await c.enviar(decir);
            expect(r.ok).toBe(false);
            expect(fetch).toHaveBeenCalledTimes(1);
            expect(operar).not.toHaveBeenCalled();
            expect(leerCola(a)).toEqual([]);
            expect(a.datos.has(CLAVE_COLA)).toBe(false);
        }
    });

    it("403 solo-dueno: el motivo para la interfaz, que deja el borrador", async () => {
        const { c } = cliente(async () => respuesta(403, { error: "solo un dueño", codigo: "solo-dueno" }));
        expect(await c.enviar({ fuente: "puente:hermes-avisos", accion: "orden", orden: { nombre: "aprobar", args: ["T1"] } })).toEqual({
            ok: false,
            estado: 403,
            codigo: "solo-dueno",
            error: "Esta orden solo la puede dar un dueño de MetaGenesis",
        });
    });

    it("sin sesión, con la puerta apagada en el aparato o con una forma imposible, no sale ninguna petición", async () => {
        const fetch = vi.fn<FetchLike>(async () => respuesta(201, { id: 1 }));
        expect(await cliente(fetch, { sesion: async () => null }).c.enviar(decir)).toMatchObject({ ok: false, estado: 401 });
        const apagada = crearClienteChatsGenesis({ puerta: puertaFalsa("apagada").puerta, fetch, url: async () => BASE, sesion: async () => JWT });
        expect(await apagada.enviar(decir)).toMatchObject({ ok: false, estado: 0 });
        expect(await cliente(fetch, { url: async () => null }).c.enviar(decir)).toMatchObject({ ok: false, estado: 0 });
        const { c } = cliente(fetch);
        expect(await c.enviar({ fuente: "puente:avisos-directores", accion: "texto", texto: "hola" } as unknown as typeof decir)).toMatchObject({ ok: false, estado: 400 });
        expect(await c.enviar({ ...decir, texto: "x".repeat(8001) })).toMatchObject({ ok: false, estado: 400 });
        expect(await c.enviar({ ...decir, accion: "borrar" } as unknown as typeof decir)).toMatchObject({ ok: false, estado: 400 });
        expect(fetch).not.toHaveBeenCalled();
    });

    it("una puerta que no contesta corta a los 15 s, con ok:false y sin reintentar", async () => {
        vi.useFakeTimers();
        const fetch = vi.fn<FetchLike>(() => new Promise<Response>(() => {}));
        const { c } = cliente(fetch);
        const p = c.enviar(decir);
        await vi.advanceTimersByTimeAsync(15_000);
        expect(await p).toMatchObject({ ok: false, estado: 0 });
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(vi.getTimerCount()).toBe(0);
    });
});

const registro = { id: "md-1763028000000-ab12", t: "2026-11-13T10:00:00.000Z", de: "alex", rol: "alex", tipo: "mensaje", texto: "hola", canal: "mando", fuente: "direccion", cursor: 7 };

describe("feed · espera larga, aborto y estados", () => {
    it("pide la fuente con esperar ≤ 25, limite ≤ 500 y desde; limpia lo que llega", async () => {
        const fetch = vi.fn<FetchLike>(async () =>
            respuesta(200, { registros: [registro, "basura", { id: 3 }], cursor: 7, latido: { t: "2026-11-13T09:59:30.000Z", de: "mac", sobra: 1 } }),
        );
        const { c } = cliente(fetch);
        const r = await c.feed({ fuente: "direccion", desde: 6, esperar: 99, limite: 9999 });
        expect(r).toEqual({ ok: true, registros: [registro], cursor: 7, latido: { t: "2026-11-13T09:59:30.000Z", de: "mac" } });
        const url = new URL(fetch.mock.calls[0][0]);
        expect(url.origin + url.pathname).toBe(`${BASE}/v1/genesis/chats/feed`);
        expect(Object.fromEntries(url.searchParams)).toEqual({ fuente: "direccion", desde: "6", limite: "500", esperar: "25" });
        expect(fetch.mock.calls[0][1]).toMatchObject({ method: "GET", credentials: "omit" });
    });

    it("la espera larga no se corta antes de 30 s: una respuesta a los 26 s llega", async () => {
        vi.useFakeTimers();
        const fetch = vi.fn<FetchLike>(() => new Promise<Response>((ok) => setTimeout(() => ok(respuesta(200, { registros: [], cursor: 9, latido: null })), 26_000)));
        const { c } = cliente(fetch);
        const p = c.feed({ fuente: "puente:hermes-avisos", desde: 9, esperar: 25 });
        await vi.advanceTimersByTimeAsync(26_000);
        expect(await p).toEqual({ ok: true, registros: [], cursor: 9, latido: null });
    });

    it("si nadie contesta, corta a los 30 s (no antes) sin lanzar ni dejar temporizadores", async () => {
        vi.useFakeTimers();
        const fetch = vi.fn<FetchLike>(() => new Promise<Response>(() => {}));
        const { c } = cliente(fetch);
        let fin: unknown = null;
        const p = c.feed({ fuente: "direccion", esperar: 25 }).then((r) => (fin = r));
        await vi.advanceTimersByTimeAsync(29_999);
        expect(fin).toBeNull();
        await vi.advanceTimersByTimeAsync(1);
        await p;
        expect(fin).toMatchObject({ ok: false, estado: 0 });
        expect(vi.getTimerCount()).toBe(0);
    });

    it("se aborta limpio: resuelve «abortado», aborta la petición y no deja temporizadores", async () => {
        vi.useFakeTimers();
        let senalFetch: AbortSignal | undefined;
        const fetch = vi.fn<FetchLike>((_u, init) => {
            senalFetch = init?.signal ?? undefined;
            return new Promise<Response>(() => {}); // ni siquiera hace caso de la señal
        });
        const { c } = cliente(fetch);
        const ctrl = new AbortController();
        const p = c.feed({ fuente: "direccion", esperar: 25 }, ctrl.signal);
        await vi.advanceTimersByTimeAsync(1_000);
        ctrl.abort();
        expect(await p).toEqual({ ok: false, estado: 0, error: "abortado" });
        expect(senalFetch?.aborted).toBe(true);
        expect(vi.getTimerCount()).toBe(0);
    });

    it("con la señal ya abortada no pide nada", async () => {
        const fetch = vi.fn<FetchLike>(async () => respuesta(200, {}));
        const { c } = cliente(fetch);
        const ctrl = new AbortController();
        ctrl.abort();
        expect(await c.feed({ fuente: "direccion" }, ctrl.signal)).toEqual({ ok: false, estado: 0, error: "abortado" });
        expect(fetch).not.toHaveBeenCalled();
    });

    it("traduce 401, 403, 503 y lo demás a estado 0; fuente desconocida sin petición", async () => {
        for (const [http, estado] of [[401, 401], [403, 403], [503, 503], [500, 0], [404, 0], [429, 0]] as const) {
            const { c } = cliente(async () => respuesta(http, { error: `e${http}` }));
            expect(await c.feed({ fuente: "direccion" })).toEqual({ ok: false, estado, error: `e${http}` });
        }
        const fetch = vi.fn<FetchLike>(async () => respuesta(200, {}));
        expect(await cliente(fetch).c.feed({ fuente: "puente:otro" })).toMatchObject({ ok: false, estado: 0 });
        expect(await cliente(fetch, { sesion: async () => null }).c.feed({ fuente: "direccion" })).toMatchObject({ ok: false, estado: 401 });
        expect(fetch).not.toHaveBeenCalled();
    });

    it("sin respuesta de red: estado 0", async () => {
        const { c } = cliente(async () => {
            throw new TypeError("Failed to fetch");
        });
        expect(await c.feed({ fuente: "direccion" })).toMatchObject({ ok: false, estado: 0 });
    });
});

describe("acuses · por el adaptador (GET, sin cola)", () => {
    it("pide en tandas de 50 con sesión y devuelve solo lo que pidió", async () => {
        const { c, operar } = cliente(async () => respuesta(200, {}));
        operar.mockImplementation(async (o: unknown) => {
            const ids = String((o as { ruta: string }).ruta.split("ids=")[1]).split(",").map(Number);
            return { via: "puerta", datos: { acuses: [...ids.map((id) => ({ id, estado: "hecho", t: "x", detalle: "ok" })), { id: 999, estado: "hecho", t: "x" }] } };
        });
        const ids = Array.from({ length: 60 }, (_, i) => i + 1);
        const r = await c.acuses([...ids, 1, -3, 1.5]);
        expect(operar).toHaveBeenCalledTimes(2);
        expect(operar.mock.calls[0][0]).toMatchObject({ metodo: "GET", conSesion: true, ruta: `/v1/genesis/chats/acuses?ids=${ids.slice(0, 50).join(",")}` });
        expect(Object.keys(r)).toHaveLength(60);
        expect(r[1]).toEqual({ estado: "hecho", detalle: "ok", t: "x" });
        expect(r[999]).toBeUndefined();
    });

    it("sin ids no pide nada; si la puerta falla, devuelve {}", async () => {
        const { c, operar } = cliente(async () => respuesta(200, {}));
        expect(await c.acuses([])).toEqual({});
        expect(operar).not.toHaveBeenCalled();
        operar.mockImplementation(async () => ({ via: "supabase", datos: null, error: "sin puerta ni respaldo" }));
        expect(await c.acuses([1])).toEqual({});
        operar.mockImplementation(async () => {
            throw new Error("x");
        });
        expect(await c.acuses([1])).toEqual({});
    });
});
