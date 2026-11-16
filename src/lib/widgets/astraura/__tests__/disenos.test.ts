import { describe, it, expect } from "vitest";
import type { ClaseTamano } from "@/lib/widgets/forma/tamanos";
import {
    Diseno,
    EleccionDiseno,
    DISENOS,
    TamanoWidget,
    tamanoDe,
    disenoValido,
    resolverDiseno,
    type PropsDiseno,
} from "../disenos";

describe("tamanoDe", () => {
    const casos: Array<[ClaseTamano, TamanoWidget]> = [
        ["micro", "compacto"],
        ["s", "compacto"],
        ["m", "medio"],
        ["panoramico", "medio"],
        ["l", "grande"],
        ["xl", "grande"],
        ["torre", "grande"],
    ];

    it.each(casos)("clase %s → %s", (clase, esperado) => {
        expect(tamanoDe(clase)).toBe(esperado);
    });
});

describe("disenoValido", () => {
    it("valores válidos se pasan tal cual", () => {
        expect(disenoValido("minimo")).toBe("minimo");
        expect(disenoValido("conversacion")).toBe("conversacion");
        expect(disenoValido("acciones")).toBe("acciones");
        expect(disenoValido("voz")).toBe("voz");
        expect(disenoValido("auto")).toBe("auto");
    });

    it("basura → auto", () => {
        expect(disenoValido("")).toBe("auto");
        expect(disenoValido("inventado")).toBe("auto");
        expect(disenoValido(null)).toBe("auto");
        expect(disenoValido(undefined)).toBe("auto");
        expect(disenoValido(123)).toBe("auto");
        expect(disenoValido({})).toBe("auto");
    });
});

describe("resolverDiseno — auto", () => {
    const ctxBase = { tactil: false, hayVoz: false, hayConversacion: false };

    it("compacto → minimo", () => {
        expect(resolverDiseno("auto", { ...ctxBase, tamano: "compacto" })).toEqual({ diseno: "minimo", degradado: false });
    });

    it("medio sin conversación → acciones", () => {
        expect(resolverDiseno("auto", { ...ctxBase, tamano: "medio", hayConversacion: false })).toEqual({ diseno: "acciones", degradado: false });
    });

    it("medio con conversación → conversacion", () => {
        expect(resolverDiseno("auto", { ...ctxBase, tamano: "medio", hayConversacion: true })).toEqual({ diseno: "conversacion", degradado: false });
    });

    it("grande táctil con voz → voz", () => {
        expect(resolverDiseno("auto", { ...ctxBase, tamano: "grande", tactil: true, hayVoz: true })).toEqual({ diseno: "voz", degradado: false });
    });

    it("grande táctil sin voz pero con conversación → conversacion", () => {
        expect(resolverDiseno("auto", { ...ctxBase, tamano: "grande", tactil: true, hayVoz: false, hayConversacion: true })).toEqual({ diseno: "conversacion", degradado: false });
    });

    it("grande táctil sin voz ni conversación → acciones", () => {
        expect(resolverDiseno("auto", { ...ctxBase, tamano: "grande", tactil: true, hayVoz: false, hayConversacion: false })).toEqual({ diseno: "acciones", degradado: false });
    });

    it("grande no táctil con conversación → conversacion", () => {
        expect(resolverDiseno("auto", { ...ctxBase, tamano: "grande", tactil: false, hayConversacion: true })).toEqual({ diseno: "conversacion", degradado: false });
    });

    it("grande no táctil sin conversación → acciones", () => {
        expect(resolverDiseno("auto", { ...ctxBase, tamano: "grande", tactil: false, hayConversacion: false })).toEqual({ diseno: "acciones", degradado: false });
    });
});

describe("resolverDiseno — elección explícita en compacto degrada", () => {
    const compacto = { tamano: "compacto" as TamanoWidget, tactil: false, hayVoz: false, hayConversacion: false };

    it.each(["conversacion", "acciones", "voz"] as const)("%s → minimo con degradado=true", (eleccion) => {
        expect(resolverDiseno(eleccion, compacto)).toEqual({ diseno: "minimo", degradado: true });
    });

    it("minimo se respeta sin degradar", () => {
        expect(resolverDiseno("minimo", compacto)).toEqual({ diseno: "minimo", degradado: false });
    });
});

describe("resolverDiseno — elección explícita en medio/grande se respeta", () => {
    const medio = { tamano: "medio" as TamanoWidget, tactil: false, hayVoz: false, hayConversacion: false };
    const grande = { tamano: "grande" as TamanoWidget, tactil: false, hayVoz: false, hayConversacion: false };

    it.each(["minimo", "conversacion", "acciones", "voz"] as const)("medio: %s se respeta", (eleccion) => {
        expect(resolverDiseno(eleccion, medio)).toEqual({ diseno: eleccion, degradado: false });
    });

    it.each(["minimo", "conversacion", "acciones", "voz"] as const)("grande: %s se respeta", (eleccion) => {
        expect(resolverDiseno(eleccion, grande)).toEqual({ diseno: eleccion, degradado: false });
    });
});

describe("DISENOS", () => {
    it("tiene las cuatro claves con nombre y sirvePara", () => {
        expect(Object.keys(DISENOS).sort()).toEqual(["acciones", "conversacion", "minimo", "voz"]);
        for (const d of ["minimo", "conversacion", "acciones", "voz"] as const) {
            expect(DISENOS[d].nombre).toBeTypeOf("string");
            expect(DISENOS[d].sirvePara).toBeTypeOf("string");
            expect(DISENOS[d].nombre.length).toBeGreaterThan(0);
            expect(DISENOS[d].sirvePara.length).toBeGreaterThan(0);
        }
    });
});

describe("PropsDiseno — solo tipos, compila", () => {
    // Este test solo verifica que el tipo existe y se puede importar.
    // Si no compila, TypeScript fallará en la puerta tsc.
    it("tipo importable", () => {
        const _p: PropsDiseno = {
            estado: "calma",
            tam: 100,
            ultima: null,
            hilo: [],
            ahora: Date.now(),
            tactil: false,
            voz: false,
            preguntar: null as any,
            botonVoz: null as any,
            sugerencias: [],
            onAbrirChat: () => {},
            onSugerencia: () => {},
        };
        expect(_p).toBeDefined();
    });
});