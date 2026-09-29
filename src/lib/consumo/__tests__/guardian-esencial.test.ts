/**
 * Lecturas ESENCIALES del guardián (2026-09-29, persistencia entre medios).
 *
 * La lectura única de `user_settings` al arrancar decide si el OS «sabe» lo que la cuenta ya
 * tenía (ventanas vistas, ajustes). Si el presupuesto LOCAL —el diario o el freno de la pestaña—
 * la descarta, el OS concluye «nunca visto» y reabre ventanas. Una lectura marcada con
 * `senalEsencial()` no cae por eso; sí respeta el cortacircuitos 402 y el freno remoto.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RAFAGA, crearGuardian, senalEsencial, type Guardian, type OpcionesGuardian } from "../guardian";
import { almacenMemoria } from "../pruebas-ayudas";

const BASE = "https://proyecto.supabase.co";
const REST = `${BASE}/rest/v1`;

function ok(cuerpo: unknown = []): Response {
    const texto = JSON.stringify(cuerpo);
    return new Response(texto, { status: 200, headers: { "content-type": "application/json", "content-length": String(texto.length) } });
}

function redFalsa(respondedor: () => Response = () => ok()) {
    return vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => Promise.resolve(respondedor()));
}

let creados: Guardian[] = [];
function guardian(op: Partial<OpcionesGuardian> & { red: OpcionesGuardian["red"] }): Guardian {
    const g = crearGuardian({ avisar: () => undefined, ...op });
    creados.push(g);
    return g;
}

const leerPrefs = (g: Guardian, senal?: AbortSignal) => g.fetch(`${REST}/user_settings?select=prefs&user_id=eq.u1`, senal ? { signal: senal } : undefined);

beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-09-29T10:00:00Z") });
});

afterEach(() => {
    for (const g of creados) g.cerrar();
    creados = [];
    vi.useRealTimers();
});

describe("lecturas esenciales", () => {
    it("la marca vive en la señal: una señal ajena o ausente no es esencial", async () => {
        const g = guardian({ red: redFalsa(), presupuestoDia: 1 });
        await g.fetch(`${REST}/posts`); // gasta el presupuesto
        const normal = await leerPrefs(g, new AbortController().signal);
        expect(normal.headers.get("x-starseed-freno")).toBe("dia");
        const esencial = await leerPrefs(g, senalEsencial());
        expect(esencial.status).toBe(200);
    });

    it("con el presupuesto diario agotado, la esencial pasa y las demás lecturas no", async () => {
        const red = redFalsa();
        const g = guardian({ red, almacen: almacenMemoria(), presupuestoDia: 3 });
        for (let i = 0; i < 3; i++) await g.fetch(`${REST}/posts?i=${i}`);
        expect(g.leerAviso().diaAgotado).toBe(true);
        expect((await g.fetch(`${REST}/posts?otra`)).status).toBe(402);
        const antes = red.mock.calls.length;
        const r = await leerPrefs(g, senalEsencial());
        expect(r.status).toBe(200);
        expect(red.mock.calls.length).toBe(antes + 1); // salió a la red
    });

    it("con el freno LOCAL de la pestaña abierto, la esencial también pasa", async () => {
        const red = redFalsa();
        const g = guardian({ red });
        const respuestas: Promise<Response>[] = [];
        for (let s = 0; s < 100; s++) {
            respuestas.push(g.fetch(`${REST}/os_mesh_relay?s=${s}a`), g.fetch(`${REST}/os_mesh_relay?s=${s}b`));
            await vi.advanceTimersByTimeAsync(1000);
        }
        await Promise.all(respuestas);
        expect(g.leerAviso().frenoLocalHasta).not.toBeNull();
        expect((await g.fetch(`${REST}/posts?x`)).headers.get("x-starseed-freno")).toBe("freno-local");
        expect((await leerPrefs(g, senalEsencial())).status).toBe(200);
    });

    it("no espera en cola: con el cubo de fichas vacío sale al instante", async () => {
        const red = redFalsa();
        const g = guardian({ red });
        for (let i = 0; i < RAFAGA; i++) void g.fetch(`${REST}/posts?i=${i}`); // vacía la ráfaga
        void g.fetch(`${REST}/posts?en-cola`); // esta espera en cola
        await vi.advanceTimersByTimeAsync(0);
        const salidas = red.mock.calls.length;
        expect(salidas).toBe(RAFAGA);
        const pendiente = leerPrefs(g, senalEsencial());
        await vi.advanceTimersByTimeAsync(0);
        expect(red.mock.calls.length).toBe(salidas + 1); // salió ya, sin esperar ficha
        expect((await pendiente).status).toBe(200);
    });

    it("SÍ respeta el freno remoto (la nube no puede servirte hoy)", async () => {
        const red = redFalsa();
        const g = guardian({ red });
        g.fijarFrenoRemoto(true);
        const r = await leerPrefs(g, senalEsencial());
        expect(r.status).toBe(402);
        expect(r.headers.get("x-starseed-freno")).toBe("freno-remoto");
        expect(red).not.toHaveBeenCalled();
    });

    it("SÍ respeta el cortacircuitos 402: abierto, no toca la red", async () => {
        const red = redFalsa(() => new Response("{}", { status: 402 }));
        const g = guardian({ red });
        await g.fetch(`${REST}/posts`); // abre el corte
        const antes = red.mock.calls.length;
        const r = await leerPrefs(g, senalEsencial());
        expect(r.status).toBe(402);
        expect(r.headers.get("x-starseed-freno")).toBe("corte");
        expect(red.mock.calls.length).toBe(antes);
    });

    it("una esencial no se une a una lectura idéntica que espera en cola", async () => {
        const red = redFalsa();
        const g = guardian({ red });
        for (let i = 0; i < RAFAGA; i++) void g.fetch(`${REST}/posts?i=${i}`);
        const enCola = g.fetch(`${REST}/user_settings?select=prefs&user_id=eq.u1`);
        await vi.advanceTimersByTimeAsync(0);
        const salidas = red.mock.calls.length;
        const esencial = leerPrefs(g, senalEsencial());
        await vi.advanceTimersByTimeAsync(0);
        expect(red.mock.calls.length).toBe(salidas + 1); // propia petición, no la cola
        expect((await esencial).status).toBe(200);
        await vi.advanceTimersByTimeAsync(5000);
        expect((await enCola).status).toBe(200);
    });
});
