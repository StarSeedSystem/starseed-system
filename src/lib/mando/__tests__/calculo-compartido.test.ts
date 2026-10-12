import { describe, expect, it } from "vitest";

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
