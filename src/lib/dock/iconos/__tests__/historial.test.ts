import { describe, expect, it } from "vitest";
import { MAX_PASOS, crearHistorial, deshacer, proponer, puedeDeshacer, puedeRehacer, rehacer, reiniciar } from "../historial";

describe("historial de deshacer/rehacer", () => {
    it("deshace y rehace paso a paso", () => {
        let h = crearHistorial(0);
        h = proponer(h, 1, { ahora: 0 });
        h = proponer(h, 2, { ahora: 10_000 });
        expect(h.presente).toBe(2);
        h = deshacer(h);
        expect(h.presente).toBe(1);
        h = deshacer(h);
        expect(h.presente).toBe(0);
        expect(puedeDeshacer(h)).toBe(false);
        h = rehacer(h);
        expect(h.presente).toBe(1);
        expect(puedeRehacer(h)).toBe(true);
    });

    it("un cambio nuevo descarta el futuro", () => {
        let h = proponer(proponer(crearHistorial(0), 1, { ahora: 0 }), 2, { ahora: 10_000 });
        h = deshacer(h);
        h = proponer(h, 9, { ahora: 20_000 });
        expect(puedeRehacer(h)).toBe(false);
        expect(deshacer(h).presente).toBe(1);
    });

    it("una ráfaga con la misma clave es UN solo paso", () => {
        let h = crearHistorial(0);
        for (let i = 1; i <= 30; i++) h = proponer(h, i, { clave: "escala", ahora: i * 20 });
        expect(h.presente).toBe(30);
        expect(h.pasado).toEqual([0]);
        expect(deshacer(h).presente).toBe(0);
    });

    it("pasada la ventana, o con otra clave, vuelve a ser un paso nuevo", () => {
        let h = proponer(crearHistorial(0), 1, { clave: "a", ahora: 0 });
        h = proponer(h, 2, { clave: "a", ahora: 5_000 });
        h = proponer(h, 3, { clave: "b", ahora: 5_100 });
        expect(h.pasado).toEqual([0, 1, 2]);
    });

    it("no apunta cambios que no cambian nada", () => {
        const h = crearHistorial("x");
        expect(proponer(h, "x")).toBe(h);
        const conIgual = proponer(crearHistorial({ a: 1 }), { a: 1 }, { igual: (p, q) => JSON.stringify(p) === JSON.stringify(q) });
        expect(conIgual.pasado).toHaveLength(0);
    });

    it("acota la memoria", () => {
        let h = crearHistorial(0);
        for (let i = 1; i <= MAX_PASOS + 30; i++) h = proponer(h, i, { ahora: i * 10_000 });
        expect(h.pasado.length).toBe(MAX_PASOS);
    });

    it("deshacer/rehacer sin nada que hacer devuelven lo mismo; reiniciar empieza de cero", () => {
        const h = crearHistorial(5);
        expect(deshacer(h)).toBe(h);
        expect(rehacer(h)).toBe(h);
        const r = reiniciar(9);
        expect(r.presente).toBe(9);
        expect(r.pasado).toEqual([]);
    });
});
