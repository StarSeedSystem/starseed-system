import { describe, it, expect } from "vitest";
import { Par, intercambiarPar } from "../selector-par";

describe("SelectorPar", () => {
    it("debe intercambiar idiomas", () => {
        const par: Par = { origen: "es", destino: "en" };
        const esperado: Par = { origen: "en", destino: "es" };
        expect(intercambiarPar(par)).toEqual(esperado);
    });

    it("no debe intercambiar si el origen es detectar", () => {
        const par: Par = { origen: "detectar", destino: "en" };
        expect(intercambiarPar(par)).toEqual(par);
    });

    // Añadir prueba de estado aquí si fuera lógica pura, pero el estado es inyectado
});
