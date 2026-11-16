import { describe, it, expect } from "vitest";
import { Par, intercambiarPar } from "../selector-par";
import type { EstadoPar } from "@/lib/traductor/tipos";

describe("intercambiarPar", () => {
    it("debe intercambiar idiomas cuando el origen no es detectar", () => {
        const par: Par = { origen: "es", destino: "en" };
        const esperado: Par = { origen: "en", destino: "es" };
        expect(intercambiarPar(par)).toEqual(esperado);
    });

    it("no debe intercambiar si el origen es detectar", () => {
        const par: Par = { origen: "detectar", destino: "en" };
        expect(intercambiarPar(par)).toEqual(par);
    });

    it("debe funcionar con otros pares de idiomas", () => {
        const par: Par = { origen: "fr", destino: "pt" };
        const esperado: Par = { origen: "pt", destino: "fr" };
        expect(intercambiarPar(par)).toEqual(esperado);
    });

    it("debe mantener inmutabilidad (no mutar el original)", () => {
        const par: Par = { origen: "es", destino: "en" };
        const original = { ...par };
        intercambiarPar(par);
        expect(par).toEqual(original);
    });
});

describe("tipo EstadoPar (de tipos.ts)", () => {
    it("debe aceptar los tres valores válidos", () => {
        const estados: EstadoPar[] = ["sin-internet", "descarga", "solo-internet"];
        expect(estados).toHaveLength(3);
    });
});