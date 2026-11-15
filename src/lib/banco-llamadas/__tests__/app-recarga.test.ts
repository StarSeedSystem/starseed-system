// @vitest-environment jsdom
/** VEN1115L · el modo banco armado sobrevive a una recarga de la interfaz (y se limpia al apagarlo). */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const CLAVE = "starseed.banco-llamadas.armado";
const TABLETA = "aaaa0002-0000-4000-8000-000000000003";
const T0 = Date.parse("2026-11-15T10:00:00Z");
let marcas: string[] = [];

async function cargar() {
    vi.resetModules();
    const d = await import("@/lib/llamadas/voz-datos/diagnostico");
    d.fijarSumideroDiagnostico((l) => marcas.push(l.detalle));
    const m = await import("../app");
    return m;
}
const asentar = () => new Promise((r) => setTimeout(r, 20));

beforeEach(() => {
    marcas = [];
    window.localStorage.clear();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T0);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) })));
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe("VEN1115L · banco armado y recarga", () => {
    it("armar guarda neurona, caducidad y llamadas restantes", async () => {
        const m = await cargar();
        expect(m.armarBanco(TABLETA, 4, 40)).toBe(true);
        const g = JSON.parse(window.localStorage.getItem(CLAVE) ?? "null");
        expect(g).toEqual({ con: TABLETA, hasta: T0 + 4 * 3_600_000, restantes: 40 });
        m.apagarBanco();
    });

    it("tras una recarga, si no caducó, vuelve a armarse con lo que quedaba y lo marca origen=recarga", async () => {
        window.localStorage.setItem(CLAVE, JSON.stringify({ con: TABLETA, hasta: T0 + 3 * 3_600_000, restantes: 31 }));
        const m = await cargar();
        await asentar();
        expect(m.estadoBanco()).toEqual({ con: TABLETA, hasta: T0 + 3 * 3_600_000, restantes: 31 });
        const l = marcas.find((x) => x.startsWith("armada "));
        expect(l).toBe(`armada con=${TABLETA} hasta=2026-11-15T13:00:00Z restantes=31 origen=recarga`);
        m.apagarBanco();
    });

    it("una recarga no repite la marca de origen en un armado normal posterior", async () => {
        const m = await cargar();
        m.armarBanco(TABLETA, 1, 5);
        await asentar();
        expect(marcas.find((x) => x.startsWith("armada "))).not.toContain("origen=recarga");
        m.apagarBanco();
    });

    it("caducado: no se arma, se borra lo guardado y se marca apagada motivo=recarga", async () => {
        window.localStorage.setItem(CLAVE, JSON.stringify({ con: TABLETA, hasta: T0 - 1000, restantes: 10 }));
        const m = await cargar();
        await asentar();
        expect(m.estadoBanco()).toBeNull();
        expect(window.localStorage.getItem(CLAVE)).toBeNull();
        expect(marcas).toContain("apagada motivo=recarga");
    });

    it("guardado ilegible o inválido: apagada motivo=recarga y se limpia", async () => {
        for (const malo of ["{no es json", JSON.stringify({ con: "no-uuid", hasta: T0 + 1e6, restantes: 5 }), JSON.stringify({ con: TABLETA, hasta: T0 + 1e6, restantes: 0 }), JSON.stringify({ con: TABLETA })]) {
            marcas = [];
            window.localStorage.setItem(CLAVE, malo);
            const m = await cargar();
            await asentar();
            expect(m.estadoBanco()).toBeNull();
            expect(window.localStorage.getItem(CLAVE)).toBeNull();
            expect(marcas).toContain("apagada motivo=recarga");
        }
    });

    it("sin nada guardado no marca nada", async () => {
        const m = await cargar();
        await asentar();
        expect(m.estadoBanco()).toBeNull();
        expect(marcas).toEqual([]);
    });

    it("apagar a mano limpia lo guardado, así una recarga posterior no lo resucita", async () => {
        const m = await cargar();
        m.armarBanco(TABLETA, 2, 10);
        m.apagarBanco("apagar");
        expect(window.localStorage.getItem(CLAVE)).toBeNull();
        const m2 = await cargar();
        await asentar();
        expect(m2.estadoBanco()).toBeNull();
    });

    it("lo restaurado se puede apagar y entonces también se limpia", async () => {
        window.localStorage.setItem(CLAVE, JSON.stringify({ con: TABLETA, hasta: T0 + 3_600_000, restantes: 7 }));
        const m = await cargar();
        expect(m.estadoBanco()).not.toBeNull();
        m.apagarBanco("a-mano");
        expect(window.localStorage.getItem(CLAVE)).toBeNull();
    });

    it("sin almacenamiento (lanza) no rompe: no se restaura y la serie sigue en memoria", async () => {
        const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("bloqueado"); });
        const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("bloqueado"); });
        const m = await cargar();
        expect(m.armarBanco(TABLETA, 1, 3)).toBe(true);
        expect(m.estadoBanco()?.restantes).toBe(3);
        m.apagarBanco();
        getItem.mockRestore();
        setItem.mockRestore();
    });
});
