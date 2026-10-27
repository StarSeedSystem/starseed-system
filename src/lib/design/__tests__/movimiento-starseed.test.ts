/**
 * Pruebas del módulo puro de movimiento StarSeed (DSN1019G).
 * Solo funciones puras exportadas: entrada → salida, sin red ni disco.
 */
import { describe, it, expect } from "vitest";
import {
    opcionesSiembra,
    opcionesEntradaCardinal,
    opcionesFundidoDesenfoque,
    opcionesElementoCompartido,
    opcionesBarridoHorizonte,
    opcionesRespiracion,
    opcionesCristalizacion,
    opcionesAlquimia,
    opcionesReducidas,
} from "../movimiento-starseed";

describe("opcionesSiembra", () => {
    it("devuelve cuatro pasos con propiedades permitidas", () => {
        const pasos = opcionesSiembra();
        expect(pasos.length).toBe(4);
        for (const p of pasos) {
            expect(typeof p.duracionMs).toBe("number");
            expect(typeof p.curva).toBe("string");
            expect(p.transform === undefined || typeof p.transform === "string").toBe(true);
            expect(p.opacity === undefined || typeof p.opacity === "number").toBe(true);
            expect(p.filter === undefined || typeof p.filter === "string").toBe(true);
            expect(p.clipPath === undefined || typeof p.clipPath === "string").toBe(true);
            expect(p.delayMs === undefined || typeof p.delayMs === "number").toBe(true);
        }
    });
});

describe("opcionesEntradaCardinal", () => {
    it("usa recorrido positivo para zenith y anchor, negativo para el resto", () => {
        const z = opcionesEntradaCardinal("zenith");
        expect(z.transform).toContain("24px");
        const h = opcionesEntradaCardinal("horizonte");
        expect(h.transform).toContain("-24px");
    });
    it("no usa propiedades prohibidas (ancho, alto, margen)", () => {
        const o = opcionesEntradaCardinal("logica");
        expect(o.transform).not.toMatch(/width/);
        expect(o.transform).not.toMatch(/height/);
        expect(o.transform).not.toMatch(/margin/);
    });
});

describe("opcionesFundidoDesenfoque", () => {
    it("tiene filter con blur y opacidad 0", () => {
        const o = opcionesFundidoDesenfoque();
        expect(o.filter).toBe("blur(8px)");
        expect(o.opacity).toBe(0);
        expect(o.duracionMs).toBe(600);
    });
});

describe("opcionesElementoCompartido", () => {
    it("usa solo scale en transform", () => {
        const o = opcionesElementoCompartido();
        expect(o.transform).toBe("scale(2.6, 3.2)");
    });
});

describe("opcionesBarridoHorizonte", () => {
    it("usa clip-path y delay", () => {
        const o = opcionesBarridoHorizonte();
        expect(o.clipPath).toBe("inset(0 100% 0 0)");
        expect(o.delayMs).toBe(300);
    });
});

describe("opcionesRespiracion", () => {
    it("tiene duración larga y scale suave", () => {
        const o = opcionesRespiracion();
        expect(o.duracionMs).toBe(5000);
        expect(o.transform).toBe("scale(1.03)");
    });
});

describe("opcionesCristalizacion", () => {
    it("tiene blur(0px) y scale(1)", () => {
        const o = opcionesCristalizacion();
        expect(o.filter).toBe("blur(0px)");
        expect(o.transform).toBe("scale(1)");
    });
});

describe("opcionesAlquimia", () => {
    it("tiene duración de escena máxima y brightness", () => {
        const o = opcionesAlquimia();
        expect(o.duracionMs).toBe(900);
        expect(o.filter).toBe("brightness(1.2)");
    });
});

describe("opcionesReducidas", () => {
    it("tiene duración 0, opacidad 1 y sin transform", () => {
        const r = opcionesReducidas();
        expect(r.duracionMs).toBe(0);
        expect(r.opacity).toBe(1);
        expect(r.transform).toBeUndefined();
    });
});
