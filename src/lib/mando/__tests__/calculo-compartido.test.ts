import { describe, expect, it, vi } from "vitest";

import { compartirCalculo } from "../calculo-compartido";

function diferido<T>() {
    let resolver!: (v: T) => void;
    let rechazar!: (e: unknown) => void;
    const promesa = new Promise<T>((res, rej) => {
        resolver = res;
        rechazar = rej;
    });
    return { promesa, resolver, rechazar };
}

describe("compartirCalculo", () => {
    it("diez llamadas a la vez hacen UN solo cálculo y reciben lo mismo", async () => {
        let veces = 0;
        const d = diferido<{ n: number }>();
        const estado = compartirCalculo(() => {
            veces += 1;
            return d.promesa;
        }, 8_000);
        const llamadas = Array.from({ length: 10 }, () => estado());
        d.resolver({ n: 7 });
        const resultados = await Promise.all(llamadas);
        expect(veces).toBe(1);
        expect(new Set(resultados).size).toBe(1);
        expect(resultados[0]).toEqual({ n: 7 });
    });

    it("reutiliza el resultado mientras está vigente y recalcula después", async () => {
        let t = 1_000;
        let veces = 0;
        const estado = compartirCalculo(async () => ++veces, 8_000, () => t);
        expect(await estado()).toBe(1);
        t += 7_999;
        expect(await estado()).toBe(1);
        t += 2;
        expect(await estado()).toBe(2);
    });

    it("un fallo no se guarda: la siguiente llamada lo intenta otra vez", async () => {
        let veces = 0;
        const estado = compartirCalculo(async () => {
            veces += 1;
            if (veces === 1) throw new Error("git status colgado");
            return "bien";
        }, 8_000);
        await expect(estado()).rejects.toThrow("git status colgado");
        expect(await estado()).toBe("bien");
        expect(veces).toBe(2);
    });

    it("olvidar() obliga a recalcular aunque siga vigente", async () => {
        let veces = 0;
        const estado = compartirCalculo(async () => ++veces, 60_000);
        await estado();
        estado.olvidar();
        expect(await estado()).toBe(2);
    });
});

describe("compartirCalculo con esperaMs (2026-10-13)", () => {
    it("con un resultado anterior, un cálculo lento devuelve el anterior y luego lo nuevo", async () => {
        vi.useFakeTimers();
        try {
            let t = 0;
            const d = diferido<string>();
            let veces = 0;
            const estado = compartirCalculo(
                () => {
                    veces += 1;
                    return veces === 1 ? Promise.resolve("viejo") : d.promesa;
                },
                1_000,
                () => t,
                6_000,
            );
            expect(await estado()).toBe("viejo");
            t = 5_000;
            const lenta = estado();
            await vi.advanceTimersByTimeAsync(6_000);
            expect(await lenta).toBe("viejo");
            d.resolver("nuevo");
            await vi.advanceTimersByTimeAsync(0);
            expect(await estado()).toBe("nuevo");
            expect(veces).toBe(2);
        } finally {
            vi.useRealTimers();
        }
    });

    it("sembrar da un anterior al arrancar y no pisa uno real", async () => {
        const d = diferido<string>();
        const estado = compartirCalculo(() => d.promesa, 1_000, () => 10_000, 0);
        estado.sembrar("del disco", 0);
        expect(await estado()).toBe("del disco");
        d.resolver("real");
        await d.promesa;
        await new Promise((r) => setTimeout(r, 0));
        estado.sembrar("otro", 0);
        expect(await estado()).toBe("real");
    });
});
