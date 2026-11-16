import { describe, it, expect } from "vitest";
import {
    fuentePedidaValida,
    veredictoFuente,
    rotuloFuente,
    type FuentePedida,
    type FuenteReal,
} from "../fuente-pantalla";

describe("fuentePedidaValida", () => {
    it("acepta 'auto' y 'proyeccion'", () => {
        expect(fuentePedidaValida("auto")).toBe("auto");
        expect(fuentePedidaValida("proyeccion")).toBe("proyeccion");
    });
    it("convierte desconocido a 'auto'", () => {
        expect(fuentePedidaValida(undefined)).toBe("auto");
        expect(fuentePedidaValida(null)).toBe("auto");
        expect(fuentePedidaValida(123)).toBe("auto");
        expect(fuentePedidaValida("invalido")).toBe("auto");
    });
});

describe("veredictoFuente", () => {
    describe("'auto' siempre cumplida sin aviso", () => {
        it("pedida 'auto' con real 'accesibilidad' → cumplida, sin aviso", () => {
            expect(veredictoFuente("auto", "accesibilidad")).toEqual({ cumplida: true, aviso: null });
        });
        it("pedida 'auto' con real 'proyeccion' → cumplida, sin aviso", () => {
            expect(veredictoFuente("auto", "proyeccion")).toEqual({ cumplida: true, aviso: null });
        });
        it("pedida 'auto' con real null → cumplida, sin aviso", () => {
            expect(veredictoFuente("auto", null)).toEqual({ cumplida: true, aviso: null });
        });
    });

    describe("'proyeccion' pedida", () => {
        it("real === 'proyeccion' → cumplida, sin aviso", () => {
            expect(veredictoFuente("proyeccion", "proyeccion")).toEqual({ cumplida: true, aviso: null });
        });
        it("real === 'accesibilidad' → NO cumplida, con aviso explicativo", () => {
            const r = veredictoFuente("proyeccion", "accesibilidad");
            expect(r.cumplida).toBe(false);
            expect(r.aviso).toBe(
                "Pediste la pantalla fluida, pero este aparato la está mandando por accesibilidad (menos fluida). Hace falta la proyección de pantalla en ese aparato."
            );
        });
        it("real null → sin aviso", () => {
            expect(veredictoFuente("proyeccion", null)).toEqual({ cumplida: false, aviso: null });
        });
    });
});

describe("rotuloFuente", () => {
    it("'accesibilidad' → 'Pantalla por accesibilidad'", () => {
        expect(rotuloFuente("accesibilidad")).toBe("Pantalla por accesibilidad");
    });
    it("'proyeccion' → 'Pantalla fluida (proyección)'", () => {
        expect(rotuloFuente("proyeccion")).toBe("Pantalla fluida (proyección)");
    });
    it("null → 'Pantalla: aún sin fuente'", () => {
        expect(rotuloFuente(null)).toBe("Pantalla: aún sin fuente");
    });
});