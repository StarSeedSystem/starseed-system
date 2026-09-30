import { describe, it, expect } from "vitest";

import { debeAvanzar } from "../avatares/mundo/pausa";
import { mundoInicial, avanzar } from "../avatares/mundo/simulacion";

describe("debeAvanzar (pausa del mundo)", () => {
    it("no avanza mientras está en pausa", () => {
        expect(debeAvanzar({ pausado: true, oculta: false })).toBe(false);
    });

    it("no avanza con la pestaña oculta", () => {
        expect(debeAvanzar({ pausado: false, oculta: true })).toBe(false);
    });

    it("no avanza si las dos cosas ocurren a la vez", () => {
        expect(debeAvanzar({ pausado: true, oculta: true })).toBe(false);
    });

    it("avanza solo sin pausa y con pestaña visible", () => {
        expect(debeAvanzar({ pausado: false, oculta: false })).toBe(true);
    });
});

describe("conducta: el estado no se mueve en pausa", () => {
    it("los pulsos descartados por pausa dejan el tick intacto", () => {
        const inicial = mundoInicial([{ id: "a", nombre: "Astra" }]);
        // Simula los pulsos del intervalo: con pausa ninguno avanza.
        const trasPausa = [true, true, true].reduce(
            (estado, pausado) =>
                debeAvanzar({ pausado, oculta: false })
                    ? avanzar(estado, 1)
                    : estado,
            inicial,
        );
        expect(trasPausa.tick).toBe(inicial.tick);
        // Y al reanudar, vuelve a avanzar.
        const reanudado = debeAvanzar({ pausado: false, oculta: false })
            ? avanzar(trasPausa, 1)
            : trasPausa;
        expect(reanudado.tick).toBe(inicial.tick + 1);
    });
});
