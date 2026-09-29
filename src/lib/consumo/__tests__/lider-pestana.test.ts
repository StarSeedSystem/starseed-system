import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CADUCA_MS, ESPERA_RECLAMO_MS, LATIDO_MS, crearLider, esLider, type CerrojosLike, type Lider } from "../lider-pestana";
import { hubCanales } from "../pruebas-ayudas";

/** navigator.locks falso: un cerrojo exclusivo por nombre, con cola, como el del navegador. */
function cerrojosFalsos(): CerrojosLike {
    const ocupado = new Set<string>();
    const colas = new Map<string, (() => void)[]>();
    return {
        request(nombre, _op, cb) {
            return new Promise<void>((resolve) => {
                const ejecutar = () => {
                    ocupado.add(nombre);
                    void cb().then(() => {
                        ocupado.delete(nombre);
                        resolve();
                        colas.get(nombre)?.shift()?.();
                    });
                };
                if (ocupado.has(nombre)) {
                    const cola = colas.get(nombre) ?? [];
                    cola.push(ejecutar);
                    colas.set(nombre, cola);
                } else ejecutar();
            });
        },
    };
}

const vaciar = () => vi.advanceTimersByTimeAsync(0);
let creados: Lider[] = [];
function lider(...args: Parameters<typeof crearLider>): Lider {
    const l = crearLider(...args);
    creados.push(l);
    return l;
}

beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-09-29T10:00:00Z") });
});
afterEach(() => {
    for (const l of creados) l.soltar();
    creados = [];
    vi.useRealTimers();
});

describe("elección con navigator.locks", () => {
    it("una sola pestaña líder; al cerrarse, la siguiente toma el relevo y se avisa", async () => {
        const cerrojos = cerrojosFalsos();
        const a = lider({ cerrojos });
        const b = lider({ cerrojos });
        await vaciar();
        expect(a.esLider()).toBe(true);
        expect(b.esLider()).toBe(false);

        const cambios: boolean[] = [];
        b.alCambiar((l) => cambios.push(l));
        a.soltar();
        await vaciar();
        expect(a.esLider()).toBe(false);
        expect(b.esLider()).toBe(true);
        expect(cambios).toEqual([true]);
    });

    it("si el navegador niega el cerrojo, cae a los latidos", async () => {
        const hub = hubCanales();
        const negados: CerrojosLike = { request: () => Promise.reject(new Error("SecurityError")) };
        const a = lider({ cerrojos: negados, crearCanal: hub.crear, id: "a" });
        await vaciar();
        await vi.advanceTimersByTimeAsync(1000 + ESPERA_RECLAMO_MS);
        expect(a.esLider()).toBe(true);
    });
});

describe("elección por latidos (sin locks)", () => {
    it("dos pestañas a la vez: gana una sola (el id menor)", async () => {
        const hub = hubCanales();
        const a = lider({ crearCanal: hub.crear, id: "a" });
        const b = lider({ crearCanal: hub.crear, id: "b" });
        await vi.advanceTimersByTimeAsync(600 + ESPERA_RECLAMO_MS + 50);
        expect(a.esLider()).toBe(true);
        expect(b.esLider()).toBe(false);
        // Con latidos vivos, nadie más reclama.
        await vi.advanceTimersByTimeAsync(LATIDO_MS * 10);
        expect(a.esLider()).toBe(true);
        expect(b.esLider()).toBe(false);
    });

    it("una pestaña que llega tarde respeta a la líder existente aunque tenga id menor", async () => {
        const hub = hubCanales();
        const b = lider({ crearCanal: hub.crear, id: "b" });
        await vi.advanceTimersByTimeAsync(2000);
        expect(b.esLider()).toBe(true);
        const a = lider({ crearCanal: hub.crear, id: "a" });
        await vi.advanceTimersByTimeAsync(LATIDO_MS * 5);
        expect(b.esLider()).toBe(true);
        expect(a.esLider()).toBe(false);
    });

    it("al cerrarse la líder (adiós) otra toma el puesto enseguida", async () => {
        const hub = hubCanales();
        const a = lider({ crearCanal: hub.crear, id: "a" });
        const b = lider({ crearCanal: hub.crear, id: "b" });
        await vi.advanceTimersByTimeAsync(1000);
        expect(a.esLider()).toBe(true);
        a.soltar();
        await vi.advanceTimersByTimeAsync(ESPERA_RECLAMO_MS + 50);
        expect(b.esLider()).toBe(true);
    });

    it("si la líder deja de latir sin despedirse, otra la sustituye tras caducar", async () => {
        const hub = hubCanales();
        const a = lider({ crearCanal: hub.crear, id: "a" });
        const b = lider({ crearCanal: hub.crear, id: "b" });
        await vi.advanceTimersByTimeAsync(1000);
        expect(a.esLider()).toBe(true);
        for (const c of hub.canales) if (c.enviados.some((m) => (m as { id?: string }).id === "a")) c.mudo = true;
        await vi.advanceTimersByTimeAsync(CADUCA_MS + LATIDO_MS + ESPERA_RECLAMO_MS);
        expect(b.esLider()).toBe(true);
    });
});

describe("sin coordinación posible", () => {
    it("sin locks ni canal, la pestaña es su propia líder", () => {
        expect(lider({}).esLider()).toBe(true);
    });

    it("sin ventana (SSR/Node), esLider() es true", () => {
        expect(typeof window).toBe("undefined");
        expect(esLider()).toBe(true);
    });
});
