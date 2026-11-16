// @vitest-environment jsdom
/** PENA2 · la página escucha el latido de Rust y no sondea dos veces (puente Tauri y reloj falsos). */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TABLETA = "aaaa0002-0000-4000-8000-000000000003";
const T0 = Date.parse("2026-11-16T10:00:00Z");
let latir: () => void = () => undefined;
const quitar = vi.fn();
const invoke = vi.fn(async (_c: string, _a?: Record<string, unknown>): Promise<unknown> => ({ ok: true }));
const listen = vi.fn(async (e: string, f: () => void) => {
    // UNI1116B: solo el evento del latido; el canal de control escucha además «control-neuronas:parada» (a veces tarde, con
    // la máquina cargada) y, sin este filtro, su oyente pisaba a `latir` y recibía una llamada sin evento.
    if (e === "banco-llamadas-latido") latir = f;
    return quitar;
});
let leidas = 0;
const asentar = () => new Promise((r) => setTimeout(r, 20));
const avanzar = async (ms: number) => {
    await vi.advanceTimersByTimeAsync(ms);
    await asentar();
};

async function cargar() {
    vi.resetModules();
    return import("../app");
}
const activos = () => invoke.mock.calls.filter((c) => c[1]?.activo === true).length;
// LAT02: se cuenta solo el oyente del latido; el canal de control registra el suyo cuando quiere.
const oyentesDelLatido = () => listen.mock.calls.filter((c) => c[0] === "banco-llamadas-latido").length;

beforeEach(() => {
    leidas = 0;
    latir = () => undefined;
    quitar.mockClear();
    invoke.mockClear();
    listen.mockClear();
    window.localStorage.clear();
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(T0);
    vi.stubGlobal("__TAURI__", { core: { invoke }, event: { listen } });
    vi.stubGlobal("fetch", vi.fn(async (u: string, i?: { method?: string }) => {
        if (u === "/api/banco-llamadas" && !i?.method) leidas++;
        return { ok: false, json: async () => ({}) };
    }));
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe("PENA2 · latido de Rust y sondeo de la página", () => {
    it("armar activa el latido y escucha el evento; reloj y latido a la vez hacen un solo sondeo", async () => {
        const m = await cargar();
        expect(m.armarBanco(TABLETA, 4, 40)).toBe(true);
        await vi.waitFor(() => {
            expect(listen.mock.calls.map((c) => c[0])).toContain("banco-llamadas-latido");
        }, {timeout: 2000, interval: 5});
        expect(invoke).toHaveBeenCalledWith("banco_latido_activar", { activo: true });
        await avanzar(1_000);
        latir(); // sondeo por latido
        await vi.waitFor(() => { expect(leidas).toBe(1); }, {timeout: 2000, interval: 5});
        await avanzar(4_000); // el reloj toca 4 s después: cede
        expect(leidas).toBe(1);
        await avanzar(5_000); // el siguiente toque del reloj ya no está pegado a un latido
        expect(leidas).toBe(2);
        latir(); // latido justo tras el sondeo del reloj: cede
        await vi.waitFor(() => { expect(leidas).toBe(2); }, {timeout: 2000, interval: 5});
        m.apagarBanco();
    });

    it("con el reloj congelado (ventana oculta) los latidos siguen sondeando cada 20 s", async () => {
        const m = await cargar();
        m.armarBanco(TABLETA, 4, 40);
        await vi.waitFor(() => {
            expect(oyentesDelLatido()).toBe(1);
        }, {timeout: 2000, interval: 5});
        for (let i = 1; i <= 3; i++) {
            vi.setSystemTime(T0 + i * 20_000); // solo avanza el reloj de pared: setInterval no se mueve
            latir();
            await vi.waitFor(() => { expect(leidas).toBe(i); }, {timeout: 2000, interval: 5});

        }
        m.apagarBanco();
    });

    it("sin Tauri no hace nada y no falla", async () => {
        vi.stubGlobal("__TAURI__", undefined);
        const m = await cargar();
        expect(m.armarBanco(TABLETA, 4, 40)).toBe(true);
        await vi.waitFor(() => {
            expect(listen).not.toHaveBeenCalled();
        }, {timeout: 2000, interval: 5});
        expect(invoke).not.toHaveBeenCalled();
        expect(() => m.apagarBanco()).not.toThrow();
    });

    it("al apagar la serie se desactiva el latido y se quita el oyente; armar dos veces no duplica", async () => {
        const m = await cargar();
        m.armarBanco(TABLETA, 4, 40);
        m.armarBanco(TABLETA, 4, 40);
        await vi.waitFor(() => {
            expect(oyentesDelLatido()).toBe(1);
        }, {timeout: 2000, interval: 5});
        expect(activos()).toBe(1);
        m.apagarBanco("cancelar");
        await vi.waitFor(() => {
            expect(quitar).toHaveBeenCalledTimes(1);
        }, {timeout: 2000, interval: 5});
        expect(invoke).toHaveBeenCalledWith("banco_latido_activar", { activo: false });
    });

    it("un invoke que rechaza no rompe la serie y al volver a armar se reintenta", async () => {
        invoke.mockImplementationOnce(async (c) => { if (c === "banco_latido_activar") throw new Error("sin-soporte"); return {}; });
        const m = await cargar();
        expect(m.armarBanco(TABLETA, 4, 40)).toBe(true);
        await vi.waitFor(() => {
            expect(m.estadoBanco()).not.toBeNull();
            expect(quitar).toHaveBeenCalledTimes(1);
        }, {timeout: 2000, interval: 5});
        m.armarBanco(TABLETA, 4, 40);
        await vi.waitFor(() => { expect(oyentesDelLatido()).toBe(2); }, {timeout: 2000, interval: 5});
        m.apagarBanco();
    });

    it("tras una recarga con la serie guardada, vuelve a activar el latido", async () => {
        window.localStorage.setItem("starseed.banco-llamadas.armado", JSON.stringify({ con: TABLETA, hasta: T0 + 3_600_000, restantes: 10 }));
        const m = await cargar();
        await vi.waitFor(() => { expect(activos()).toBe(1); }, {timeout: 2000, interval: 5});
        m.apagarBanco();
    });
});
