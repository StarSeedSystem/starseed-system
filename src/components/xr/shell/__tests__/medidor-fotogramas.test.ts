/** XR1010AE · pruebas unitarias del medidor de fotogramas (node, reloj falso). */
import { describe, it, expect } from "vitest";
import { crearMededor } from "../medidor-fotogramas";

describe("crearMededor", () => {
    it("media y p95 devuelven 0 cuando no hay historial", () => {
        const m = crearMededor();
        expect(m.media()).toBe(0);
        expect(m.p95()).toBe(0);
    });

    it("registrar agrega valores y media los calcula", () => {
        const m = crearMededor(5);
        m.registrar(10);
        m.registrar(20);
        m.registrar(30);
        expect(m.media()).toBe(20);
    });

    it("registrar descarte fotogramas absurdos (>250 ms)", () => {
        const m = crearMededor(10);
        m.registrar(50);
        m.registrar(300); // debería ignorarse
        m.registrar(60);
        expect(m.media()).toBe((50 + 60) / 2);
    });

    it("la ventana deslizante descarta los más antiguos", () => {
        const m = crearMededor(3);
        m.registrar(10);
        m.registrar(20);
        m.registrar(30);
        m.registrar(40); // ahora solo los últimos 3
        expect(m.media()).toBe(30); // (20+30+40)/3 ... wait 10 removed, remaining 20,30,40 -> avg 30
    });

    it("p95 calcula el percentil 95 correcto", () => {
        const m = crearMededor(20);
        // insertar 20 valores del 1 al 20
        for (let i = 1; i <= 20; i++) m.registrar(i * 10);
        expect(m.p95()).toBe(190); // 95% of 20 values -> index ceil(0.95*20)-1 = 19-1=18 -> value 19*10=190
    });

    it("presupuesto devuelve el ms por hz", () => {
        const m = crearMededor();
        expect(m.presupuesto(60)).toBeCloseTo(16.666666666666668);
        expect(m.presupuesto(72)).toBeCloseTo(13.88888888888889);
        expect(m.presupuesto(30)).toBe(33.333333333333336);
    });

    it("media y p95 después de muchos registros dentro de la ventana", () => {
        const m = crearMededor(20);
        for (let i = 1; i <= 20; i++) m.registrar(i * 10);
        expect(m.media()).toBeCloseTo(105);
        expect(m.p95()).toBeCloseTo(190);
    });
});