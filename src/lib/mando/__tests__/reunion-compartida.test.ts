import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { crearReunionCompartida } from "@/lib/mando/reunion-compartida";

// Con temporizadores falsos: ninguna prueba espera de verdad.
beforeEach(() => {
    vi.useFakeTimers();
});
afterEach(() => {
    vi.useRealTimers();
});

describe("crearReunionCompartida", () => {
    it("20 obtenidas con la reunión pendiente llaman a fn UNA sola vez", async () => {
        let resolver: ((v: number) => void) | null = null;
        const fn = vi.fn(
            () =>
                new Promise<number>((res) => {
                    resolver = res;
                }),
        );
        const r = crearReunionCompartida(fn, { esperaMs: 3_000, frescoMs: 10_000 });
        const esperas = Array.from({ length: 20 }, () => r.obtener());
        expect(fn).toHaveBeenCalledTimes(1);
        // Sin bueno previo se espera a que termine; cuando acaba, todas reciben lo nuevo.
        const resolverLate = resolver as unknown as ((v: number) => void) | null;
        resolverLate?.(7);
        await vi.advanceTimersByTimeAsync(0);
        const resultados = await Promise.all(esperas);
        expect(resultados.every((x) => x.datos === 7 && !x.obsoleto)).toBe(true);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it("con un bueno anterior y tope vencido devuelve el viejo con obsoleto y luego lo nuevo", async () => {
        let resolver: ((v: string) => void) | null = null;
        const fn = vi
            .fn<() => Promise<string>>()
            .mockResolvedValueOnce("primero")
            .mockImplementation(
                () =>
                    new Promise<string>((res) => {
                        resolver = res;
                    }),
            );
        let reloj = 1_000;
        const r = crearReunionCompartida(fn, { frescoMs: 15_000, esperaMs: 6_000, ahora: () => reloj });

        const primero = await r.obtener();
        expect(primero).toMatchObject({ datos: "primero", obsoleto: false });

        // Fresco (< 15 s): no vuelve a llamar a fn.
        reloj += 5_000;
        const fresco = await r.obtener();
        expect(fresco).toMatchObject({ datos: "primero", obsoleto: false });
        expect(fn).toHaveBeenCalledTimes(1);

        // Rancio y lento: tras 6 s llega el viejo marcado, y la llamada sigue en marcha.
        reloj += 20_000;
        const espera = r.obtener();
        await vi.advanceTimersByTimeAsync(6_100);
        const viejo = await espera;
        expect(viejo).toMatchObject({ datos: "primero", obsoleto: true, t: primero.t });
        expect(fn).toHaveBeenCalledTimes(2);

        // Cuando la llamada acaba, actualiza el resultado.
        const resolverLate = resolver as unknown as ((v: string) => void) | null;
        resolverLate?.("segundo");
        await vi.advanceTimersByTimeAsync(0);
        reloj += 100;
        const nuevo = await r.obtener();
        expect(nuevo).toMatchObject({ datos: "segundo", obsoleto: false });
    });

    it("si fn rechaza se conserva el último bueno y el siguiente intento vuelve a llamar", async () => {
        const fn = vi
            .fn<() => Promise<string>>()
            .mockResolvedValueOnce("bueno")
            .mockRejectedValueOnce(new Error("caído"))
            .mockResolvedValueOnce("recuperado");
        const r = crearReunionCompartida(fn, { frescoMs: 1_000, esperaMs: 6_000 });

        const bueno = await r.obtener();
        expect(bueno.datos).toBe("bueno");

        // Ya rancio y fn falla: se conserva el bueno y queda libre.
        await vi.advanceTimersByTimeAsync(1_100);
        const trasFallo = await r.obtener();
        expect(trasFallo).toMatchObject({ datos: "bueno", obsoleto: true });
        expect(fn).toHaveBeenCalledTimes(2);

        await vi.advanceTimersByTimeAsync(1_100);
        const recuperado = await r.obtener();
        expect(recuperado).toMatchObject({ datos: "recuperado", obsoleto: false });
        expect(fn).toHaveBeenCalledTimes(3);
    });

    it("con obsoletoTrasMs, una cifra anterior joven no se marca obsoleta aunque venza el tope", async () => {
        const fn = vi
            .fn<() => Promise<string>>()
            .mockResolvedValueOnce("primero")
            .mockImplementation(() => new Promise<string>(() => {}));
        let reloj = 1_000;
        const r = crearReunionCompartida(fn, { frescoMs: 15_000, esperaMs: 1_500, obsoletoTrasMs: 90_000, ahora: () => reloj });
        await r.obtener();
        reloj += 20_000; // rancia para recalcular, joven para el aviso
        const p1 = r.obtener();
        await vi.advanceTimersByTimeAsync(1_600);
        expect(await p1).toMatchObject({ datos: "primero", obsoleto: false });
        reloj += 80_000; // ya pasa de 90 s
        const p2 = r.obtener();
        await vi.advanceTimersByTimeAsync(1_600);
        expect(await p2).toMatchObject({ datos: "primero", obsoleto: true });
    });

    it("sin bueno anterior, un rechazo da null obsoleto y permite reintentar", async () => {
        const fn = vi.fn<() => Promise<string>>().mockRejectedValue(new Error("sin datos"));
        const r = crearReunionCompartida(fn, { frescoMs: 1_000, esperaMs: 6_000 });
        const res = await r.obtener();
        expect(res).toMatchObject({ datos: null, obsoleto: true });
        expect(fn).toHaveBeenCalledTimes(1);
        await r.obtener();
        expect(fn).toHaveBeenCalledTimes(2);
    });
});

describe("reunión colgada (2026-10-13)", () => {
    it("pasado maxEnMarchaMs se suelta y arranca otra; la colgada que acaba tarde no pisa a la nueva", async () => {
        const resolvers: Array<(v: string) => void> = [];
        const fn = vi
            .fn<() => Promise<string>>()
            .mockResolvedValueOnce("bueno")
            .mockImplementation(() => new Promise<string>((res) => resolvers.push(res)));
        let reloj = 0;
        const avisos: string[] = [];
        const r = crearReunionCompartida(fn, {
            frescoMs: 1_000, esperaMs: 10, maxEnMarchaMs: 5_000, ahora: () => reloj, avisar: (t) => avisos.push(t),
        });
        expect((await r.obtener()).datos).toBe("bueno");
        reloj = 2_000;
        const colgada = r.obtener();
        await vi.advanceTimersByTimeAsync(20);
        expect(await colgada).toMatchObject({ datos: "bueno", obsoleto: true });
        expect(fn).toHaveBeenCalledTimes(2);
        reloj = 3_000;
        await Promise.all([r.obtener(), vi.advanceTimersByTimeAsync(20)]);
        expect(fn).toHaveBeenCalledTimes(2); // aún no: sigue dentro del margen
        reloj = 8_000;
        const nueva = r.obtener();
        await vi.advanceTimersByTimeAsync(20);
        await nueva;
        expect(fn).toHaveBeenCalledTimes(3);
        expect(avisos.length).toBe(1);
        resolvers[1]("nuevo");
        await vi.advanceTimersByTimeAsync(0);
        resolvers[0]("viejo-tardio");
        await vi.advanceTimersByTimeAsync(0);
        reloj = 8_500;
        expect((await r.obtener()).datos).toBe("nuevo");
    });
});
