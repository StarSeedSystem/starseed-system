/**
 * UNI1116A · veredicto y rótulo de fuente de pantalla.
 * 2×3 matrix: pedida × {null, accesibilidad, proyección}
 * Importa solo describe, it, expect de vitest (globals: false).
 */

import { describe, it, expect } from "vitest";
import { fuentePedidaValida, veredictoFuente, rotuloFuente } from "../fuente-pantalla";

describe("fuente-pantalla", () => {
    describe("fuentePedidaValida", () => {
        it("devuelve 'auto' para valores desconocidos", () => {
            expect(fuentePedidaValida(undefined)).toBe("auto");
            expect(fuentePedidaValida(null)).toBe("auto");
            expect(fuentePedidaValida("otro")).toBe("auto");
        });
        it("devuelve el valor cuando es 'auto' o 'proyeccion'", () => {
            expect(fuentePedidaValida("auto")).toBe("auto");
            expect(fuentePedidaValida("proyeccion")).toBe("proyeccion");
        });
    });

    describe("veredictoFuente", () => {
        it("auto siempre cumplida sin aviso", () => {
            expect(veredictoFuente("auto", null)).toEqual({ cumplida: true, aviso: null });
            expect(veredictoFuente("auto", "accesibilidad")).toEqual({ cumplida: true, aviso: null });
            expect(veredictoFuente("auto", "proyeccion")).toEqual({ cumplida: true, aviso: null });
        });

        it("proyeccion pedida y real === proyeccion → cumplida", () => {
            expect(veredictoFuente("proyeccion", "proyeccion")).toEqual({ cumplida: true, aviso: null });
        });

        it("proyeccion pedida y real === accesibilidad → NO cumplida con aviso", () => {
            const resultado = veredictoFuente("proyeccion", "accesibilidad");
            expect(resultado.cumplida).toBe(false);
            expect(resultado.aviso).toBe(
                "Pediste la pantalla fluida, pero este aparato la está mandando por accesibilidad (menos fluida). Hace falta la proyección de pantalla en ese aparato.",
            );
        });

        it("proyeccion pedida y real null → sin aviso, no cumplida", () => {
            expect(veredictoFuente("proyeccion", null)).toEqual({ cumplida: false, aviso: null });
        });
    });

    describe("rotuloFuente", () => {
        it("muestra el rótulo correcto según la fuente real", () => {
            expect(rotuloFuente("proyeccion")).toBe("Pantalla fluida (proyección)");
            expect(rotuloFuente("accesibilidad")).toBe("Pantalla por accesibilidad");
            expect(rotuloFuente(null)).toBe("Pantalla: aún sin fuente");
        });
    });
});