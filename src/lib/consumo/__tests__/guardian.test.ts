import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    CLAVE_CORTE,
    CLAVE_DIA,
    CORTE_BASE_MS,
    EXCESO_MAX_MS,
    FRENO_LOCAL_MS,
    RAFAGA,
    crearGuardian,
    fetchGuardado,
    rutaDe,
    type Guardian,
    type OpcionesGuardian,
} from "../guardian";
import { almacenMemoria, hubCanales, jsonDe } from "../pruebas-ayudas";

const BASE = "https://proyecto.supabase.co";
const REST = `${BASE}/rest/v1`;

type Respondedor = (input: RequestInfo | URL, init?: RequestInit) => Response | Promise<Response>;

function ok(cuerpo: unknown = [], cabeceras: Record<string, string> = {}): Response {
    const texto = JSON.stringify(cuerpo);
    return new Response(texto, { status: 200, headers: { "content-type": "application/json", "content-length": String(texto.length), ...cabeceras } });
}

function redFalsa(respondedor: Respondedor = () => ok()) {
    return vi.fn((input: RequestInfo | URL, init?: RequestInit) => Promise.resolve(respondedor(input, init)));
}

const vaciar = () => vi.advanceTimersByTimeAsync(0);

let creados: Guardian[] = [];
function guardian(op: Partial<OpcionesGuardian> & { red: OpcionesGuardian["red"] }): Guardian {
    const g = crearGuardian({ avisar: () => undefined, ...op });
    creados.push(g);
    return g;
}

beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-09-29T10:00:00Z") });
});

afterEach(() => {
    for (const g of creados) g.cerrar();
    creados = [];
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe("rutaDe", () => {
    it("recorta consulta, ids y segmentos sobrantes", () => {
        expect(rutaDe(`${REST}/os_mesh_relay?select=*&owner=eq.1`)).toBe("/rest/v1/os_mesh_relay");
        expect(rutaDe(`${REST}/rpc/merge_user_prefs`)).toBe("/rest/v1/rpc/merge_user_prefs");
        expect(rutaDe(`${BASE}/auth/v1/user`)).toBe("/auth/v1/user");
        expect(rutaDe(`${BASE}/auth/v1/token?grant_type=refresh_token`)).toBe("/auth/v1/token");
        expect(rutaDe(`${BASE}/storage/v1/object/avatares/u1/foto.png`)).toBe("/storage/v1/object/avatares");
    });
});

describe("cortacircuitos", () => {
    it("se abre con un 402 y ya no toca la red: 402 sintético con mensaje en español", async () => {
        const red = redFalsa(() => new Response("{}", { status: 402 }));
        const g = guardian({ red });

        const primera = await g.fetch(`${REST}/posts`, { method: "GET" });
        expect(primera.status).toBe(402);
        expect(red).toHaveBeenCalledTimes(1);

        const segunda = await g.fetch(`${REST}/os_mesh_relay`);
        const escritura = await g.fetch(`${REST}/posts`, { method: "POST", body: "{}" });
        expect(red).toHaveBeenCalledTimes(1); // ninguna salió a la red
        expect(segunda.status).toBe(402);
        expect(escritura.status).toBe(402);
        const cuerpo = await jsonDe(segunda);
        expect(cuerpo.code).toBe("starseed_freno");
        expect(cuerpo.message).toMatch(/^Pausa de consumo: /);
        expect(segunda.headers.get("x-starseed-freno")).toBe("corte");
        expect(g.leerContadores().bloqueadas).toBe(2);
        expect(g.leerContadores().corteHasta).toBe(Date.now() + CORTE_BASE_MS);
    });

    it("se abre con el texto «exceed_egress_quota» o «restricted» en un error, no con un 400 corriente", async () => {
        let cuerpo = '{"message":"column restricted does not exist"}';
        let estado = 400;
        const red = redFalsa(() => new Response(cuerpo, { status: estado }));
        const g = guardian({ red });

        await g.fetch(`${REST}/posts`);
        await vaciar();
        expect(g.leerAviso().corte).toBe(false); // un 400 normal no es una señal de cuota

        cuerpo = '{"message":"Service for this project is restricted due to exceed_egress_quota"}';
        estado = 403;
        const r = await g.fetch(`${REST}/cafe_accounts`);
        expect(await r.text()).toContain("exceed_egress_quota"); // el llamador lee su cuerpo intacto
        await vaciar();
        expect(g.leerAviso().corte).toBe(true);

        const bloqueada = await g.fetch(`${REST}/posts?x=1`);
        expect(bloqueada.status).toBe(402);
        expect(red).toHaveBeenCalledTimes(2);
    });

    it("tras 30 min deja pasar UNA prueba; si va bien, se cierra", async () => {
        let estado = 402;
        let resolverSonda: ((r: Response) => void) | null = null;
        const red = vi.fn((_i: RequestInfo | URL, _n?: RequestInit) => {
            if (estado === 0) return new Promise<Response>((res) => (resolverSonda = res));
            return Promise.resolve(new Response("{}", { status: estado }));
        });
        const g = guardian({ red });
        await g.fetch(`${REST}/posts`);
        expect(g.leerAviso().corte).toBe(true);

        await vi.advanceTimersByTimeAsync(CORTE_BASE_MS - 1000);
        expect((await g.fetch(`${REST}/posts`)).status).toBe(402);
        expect(red).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(2000);
        estado = 0; // la prueba queda pendiente
        const sonda = g.fetch(`${REST}/posts?sonda=1`);
        await vaciar();
        expect(red).toHaveBeenCalledTimes(2);
        // Mientras la prueba está en vuelo, las demás siguen en pausa.
        expect((await g.fetch(`${REST}/otra`)).status).toBe(402);
        expect(red).toHaveBeenCalledTimes(2);

        (resolverSonda as unknown as (r: Response) => void)(ok([{ id: 1 }]));
        expect((await sonda).status).toBe(200);
        await vaciar();
        expect(g.leerAviso().corte).toBe(false);

        estado = 200;
        expect((await g.fetch(`${REST}/otra`)).status).toBe(200);
        expect(red).toHaveBeenCalledTimes(3);
    });

    it("si la prueba vuelve a fallar, espera 30 min más (60)", async () => {
        const red = redFalsa(() => new Response("{}", { status: 402 }));
        const g = guardian({ red });
        await g.fetch(`${REST}/posts`);
        const t0 = Date.now();
        await vi.advanceTimersByTimeAsync(CORTE_BASE_MS + 1);
        await g.fetch(`${REST}/posts`); // prueba → 402
        expect(red).toHaveBeenCalledTimes(2);
        const hasta = g.leerContadores().corteHasta as number;
        expect(hasta - (t0 + CORTE_BASE_MS + 1)).toBe(2 * CORTE_BASE_MS);
    });

    it("el refresco del token recibe 503 (reintentable) para que la sesión sobreviva", async () => {
        const red = redFalsa(() => new Response('{"message":"payment required"}', { status: 402 }));
        const g = guardian({ red });
        const real = await g.fetch(`${BASE}/auth/v1/token?grant_type=refresh_token`, { method: "POST", body: "{}" });
        expect(real.status).toBe(503);
        const sintetica = await g.fetch(`${BASE}/auth/v1/token?grant_type=refresh_token`, { method: "POST", body: "{}" });
        expect(sintetica.status).toBe(503);
        expect((await jsonDe(sintetica)).code).toBe("starseed_freno");
        expect(red).toHaveBeenCalledTimes(1);
    });

    it("avisa a las demás pestañas y se recuerda al abrir una nueva", async () => {
        const hub = hubCanales();
        const almacen = almacenMemoria();
        const redA = redFalsa(() => new Response("{}", { status: 402 }));
        const redB = redFalsa();
        const a = guardian({ red: redA, almacen, crearCanal: hub.crear });
        const b = guardian({ red: redB, almacen, crearCanal: hub.crear });
        const oyente = vi.fn();
        b.suscribir(oyente);

        await a.fetch(`${REST}/os_mesh_relay`);
        await vaciar();

        expect(oyente).toHaveBeenCalled();
        expect(b.leerAviso().corte).toBe(true);
        expect((await b.fetch(`${REST}/neuron_devices`)).status).toBe(402);
        expect(redB).not.toHaveBeenCalled();
        expect(almacen.getItem(CLAVE_CORTE)).toContain('"hasta"');

        const redC = redFalsa();
        const c = guardian({ red: redC, almacen, crearCanal: hub.crear });
        expect((await c.fetch(`${REST}/posts`)).status).toBe(402);
        expect(redC).not.toHaveBeenCalled();
    });

    it("la instantánea del aviso es el MISMO objeto mientras nada cambia", async () => {
        const g = guardian({ red: redFalsa() });
        const a1 = g.leerAviso();
        await g.fetch(`${REST}/posts`);
        expect(g.leerAviso()).toBe(a1);
        expect(g.leerAviso()).toBe(g.leerAviso());
    });
});

describe("cubo de fichas", () => {
    it("deja pasar la ráfaga, pone en cola el resto y la atiende a 1 por segundo", async () => {
        const red = redFalsa();
        const g = guardian({ red });
        const promesas = Array.from({ length: RAFAGA + 2 }, (_, i) => g.fetch(`${REST}/posts?i=${i}`));
        await vaciar();
        expect(red).toHaveBeenCalledTimes(RAFAGA);
        await vi.advanceTimersByTimeAsync(1000);
        expect(red).toHaveBeenCalledTimes(RAFAGA + 1);
        await vi.advanceTimersByTimeAsync(1000);
        expect(red).toHaveBeenCalledTimes(RAFAGA + 2);
        const res = await Promise.all(promesas);
        expect(res.every((r) => r.status === 200)).toBe(true);
    });

    it("las escrituras nunca esperan en cola", async () => {
        const red = redFalsa();
        const g = guardian({ red });
        for (let i = 0; i < RAFAGA; i++) void g.fetch(`${REST}/posts?i=${i}`);
        void g.fetch(`${REST}/posts?i=cola`);
        await vaciar();
        expect(red).toHaveBeenCalledTimes(RAFAGA);
        const escritura = await g.fetch(`${REST}/posts`, { method: "POST", body: '{"a":1}' });
        expect(escritura.status).toBe(200);
        expect(red).toHaveBeenCalledTimes(RAFAGA + 1);
    });

    it("si el exceso dura 60 s, freno local de 2 min con aviso en consola y en el contador", async () => {
        const avisar = vi.fn();
        const red = redFalsa();
        const g = guardian({ red, avisar });
        const respuestas: Promise<Response>[] = [];
        // Dos lecturas por segundo, sostenidas: el doble de lo permitido. La ráfaga aguanta ~30 s;
        // desde ahí la cola no se vacía nunca y a los 60 s salta el freno.
        for (let s = 0; s < 100; s++) {
            respuestas.push(g.fetch(`${REST}/os_mesh_relay?s=${s}a`), g.fetch(`${REST}/os_mesh_relay?s=${s}b`));
            await vi.advanceTimersByTimeAsync(1000);
        }
        expect(g.leerContadores().frenos).toBe(1);
        expect(avisar).toHaveBeenCalledWith(expect.stringContaining("Freno local"));
        expect(g.leerAviso().frenoLocalHasta).not.toBeNull();
        const todas = await Promise.all(respuestas);
        const frenadas = todas.filter((r) => r.headers.get("x-starseed-freno") === "freno-local");
        expect(frenadas.length).toBeGreaterThan(0);
        const salidas = red.mock.calls.length;
        expect(salidas).toBeLessThanOrEqual(RAFAGA + 100); // nunca más de lo que el cubo permite

        // Durante el freno, las lecturas no salen; las escrituras sí.
        expect((await g.fetch(`${REST}/posts?x`)).status).toBe(402);
        expect((await g.fetch(`${REST}/posts`, { method: "PATCH", body: "{}" })).status).toBe(200);
        expect(red.mock.calls.length).toBe(salidas + 1);

        await vi.advanceTimersByTimeAsync(FRENO_LOCAL_MS + 100);
        expect(g.leerAviso().frenoLocalHasta).toBeNull();
        expect((await g.fetch(`${REST}/posts?despues`)).status).toBe(200);
        expect(EXCESO_MAX_MS).toBe(60_000);
    });

    it("una lectura en cola que se aborta rechaza con AbortError y no sale a la red", async () => {
        const red = redFalsa();
        const g = guardian({ red });
        for (let i = 0; i < RAFAGA; i++) void g.fetch(`${REST}/posts?i=${i}`);
        const ctl = new AbortController();
        const enCola = g.fetch(`${REST}/posts?abortada`, { signal: ctl.signal });
        await vaciar();
        ctl.abort();
        await expect(enCola).rejects.toMatchObject({ name: "AbortError" });
        await vi.advanceTimersByTimeAsync(5000);
        expect(red.mock.calls.some(([u]) => String(u).includes("abortada"))).toBe(false);
    });
});

describe("presupuesto diario del dispositivo", () => {
    it("al pasarlo solo pasan escrituras y autenticación; se renueva a las 00:00 UTC", async () => {
        const almacen = almacenMemoria();
        const red = redFalsa();
        const g = guardian({ red, almacen, presupuestoDia: 5 });
        for (let i = 0; i < 5; i++) await g.fetch(`${REST}/posts?i=${i}`);
        expect(g.leerContadores().hoy).toBe(5);
        expect(g.leerAviso().diaAgotado).toBe(true);

        const lectura = await g.fetch(`${REST}/posts?i=6`);
        expect(lectura.status).toBe(402);
        expect(lectura.headers.get("x-starseed-freno")).toBe("dia");
        expect((await g.fetch(`${REST}/posts`, { method: "POST", body: "{}" })).status).toBe(200);
        expect((await g.fetch(`${REST}/rpc/merge_user_prefs`, { method: "POST", body: "{}" })).status).toBe(200);
        expect((await g.fetch(`${BASE}/auth/v1/token?grant_type=refresh_token`, { method: "POST", body: "{}" })).status).toBe(200);
        expect((await g.fetch(`${BASE}/auth/v1/user`)).status).toBe(200);

        await vi.advanceTimersByTimeAsync(5000);
        expect(almacen.getItem(CLAVE_DIA)).toContain('"n":9');

        vi.setSystemTime(new Date("2026-09-30T00:00:01Z"));
        expect((await g.fetch(`${REST}/posts?manana`)).status).toBe(200);
        expect(g.leerContadores().hoy).toBe(1);
    });

    it("el contador del día se suma entre pestañas del mismo dispositivo", async () => {
        const almacen = almacenMemoria();
        const a = guardian({ red: redFalsa(), almacen });
        const b = guardian({ red: redFalsa(), almacen });
        await a.fetch(`${REST}/a`);
        await a.fetch(`${REST}/a2`);
        await b.fetch(`${REST}/b`);
        await vi.advanceTimersByTimeAsync(6000);
        expect(JSON.parse(almacen.getItem(CLAVE_DIA) as string).n).toBe(3);
    });
});

describe("deduplicación", () => {
    it("dos lecturas idénticas en vuelo comparten UNA petición y cada una recibe su copia", async () => {
        const resolvers: ((r: Response) => void)[] = [];
        const red = vi.fn(() => new Promise<Response>((res) => resolvers.push(res)));
        const g = guardian({ red });
        const cab = { Authorization: "Bearer a", apikey: "k" };
        const p1 = g.fetch(`${REST}/neuron_devices?select=*`, { headers: cab });
        const p2 = g.fetch(`${REST}/neuron_devices?select=*`, { headers: new Headers(cab) });
        const otraCuenta = g.fetch(`${REST}/neuron_devices?select=*`, { headers: { Authorization: "Bearer b", apikey: "k" } });
        await vaciar();
        expect(red).toHaveBeenCalledTimes(2);
        resolvers[0](ok([{ id: "x" }]));
        resolvers[1](ok([{ id: "otra" }]));
        const [r1, r2] = await Promise.all([p1, p2]);
        expect(r1).not.toBe(r2);
        expect(await r1.json()).toEqual([{ id: "x" }]);
        expect(await r2.json()).toEqual([{ id: "x" }]);
        expect(await (await otraCuenta).json()).toEqual([{ id: "otra" }]);
        // Terminada, una nueva lectura igual vuelve a salir a la red.
        const p3 = g.fetch(`${REST}/neuron_devices?select=*`, { headers: cab });
        await vaciar();
        expect(red).toHaveBeenCalledTimes(3);
        resolvers[2](ok([]));
        await p3;
    });

    it("si uno de los dos aborta, el otro recibe su respuesta; si abortan todos, se corta la red", async () => {
        const señales: AbortSignal[] = [];
        const resolvers: ((r: Response) => void)[] = [];
        const red = vi.fn((_i: RequestInfo | URL, init?: RequestInit) => {
            señales.push(init?.signal as AbortSignal);
            return new Promise<Response>((res) => resolvers.push(res));
        });
        const g = guardian({ red });
        const c1 = new AbortController();
        const p1 = g.fetch(`${REST}/x`, { signal: c1.signal });
        const p2 = g.fetch(`${REST}/x`);
        await vaciar();
        c1.abort();
        await expect(p1).rejects.toMatchObject({ name: "AbortError" });
        expect(señales[0].aborted).toBe(false);
        resolvers[0](ok([1]));
        expect(await (await p2).json()).toEqual([1]);

        const c3 = new AbortController();
        const c4 = new AbortController();
        const p3 = g.fetch(`${REST}/y`, { signal: c3.signal });
        const p4 = g.fetch(`${REST}/y`, { signal: c4.signal });
        await vaciar();
        c3.abort();
        c4.abort();
        await expect(p3).rejects.toMatchObject({ name: "AbortError" });
        await expect(p4).rejects.toMatchObject({ name: "AbortError" });
        expect(señales[1].aborted).toBe(true);
    });
});

describe("transparencia y contadores", () => {
    it("las escrituras pasan con el MISMO init (cuerpo intacto) y se cuentan por ruta con bytes", async () => {
        const red = redFalsa(() => ok({ ok: true }));
        const g = guardian({ red });
        const init: RequestInit = { method: "POST", body: '{"hola":"mundo"}', headers: { "content-type": "application/json" } };
        await g.fetch(`${REST}/rpc/merge_user_prefs`, init);
        expect(red.mock.calls[0][1]).toBe(init);
        await g.fetch(`${REST}/os_mesh_relay?a=1`);
        await g.fetch(`${REST}/os_mesh_relay?a=2`);
        const c = g.leerContadores();
        expect(c.total).toBe(3);
        expect(c.porRuta["/rest/v1/os_mesh_relay"]).toEqual({ n: 2, bytes: 2 * '{"ok":true}'.length });
        expect(c.porRuta["/rest/v1/rpc/merge_user_prefs"].n).toBe(1);
    });

    it("los errores de red se propagan como en fetch", async () => {
        const red = vi.fn(() => Promise.reject(new TypeError("Failed to fetch")));
        const g = guardian({ red });
        await expect(g.fetch(`${REST}/posts`)).rejects.toThrow("Failed to fetch");
        await expect(g.fetch(`${REST}/posts`, { method: "POST", body: "{}" })).rejects.toThrow("Failed to fetch");
    });

    it("en SSR/Node (sin ventana) fetchGuardado es fetch tal cual", async () => {
        const nativo = vi.fn(() => Promise.resolve(new Response("{}", { status: 402 })));
        vi.stubGlobal("fetch", nativo);
        const init = { method: "GET" };
        const r = await fetchGuardado(`${REST}/posts`, init);
        expect(r.status).toBe(402);
        await fetchGuardado(`${REST}/posts`, init);
        expect(nativo).toHaveBeenCalledTimes(2); // sin cortacircuitos fuera del navegador
        expect(nativo.mock.calls[0]).toEqual([`${REST}/posts`, init]);
    });
});

describe("freno remoto", () => {
    it("con el freno activo solo pasan escrituras, auth y la propia lectura de os_freno", async () => {
        const red = redFalsa();
        const g = guardian({ red });
        g.fijarFrenoRemoto(true);
        const r = await g.fetch(`${REST}/posts`);
        expect(r.headers.get("x-starseed-freno")).toBe("freno-remoto");
        expect((await g.fetch(`${REST}/os_freno?id=eq.1`)).status).toBe(200);
        expect((await g.fetch(`${REST}/posts`, { method: "POST", body: "{}" })).status).toBe(200);
        expect((await g.fetch(`${BASE}/auth/v1/user`)).status).toBe(200);
        g.fijarFrenoRemoto(false);
        expect((await g.fetch(`${REST}/posts`)).status).toBe(200);
        expect(g.leerContadores().frenoRemoto).toBe(false);
    });
});
