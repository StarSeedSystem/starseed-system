/**
 * TESTS de normalización en español para la voz (Tarea J1b · Ola 264).
 * Cubren pronunciaciones propias, unidades, monedas, porcentajes, horas,
 * fechas, ordinales, concordancia, Markdown, siglas, idempotencia y troceo.
 * (2026-09-06, Ola 264)
 */

import { describe, it, expect } from "vitest";
import { normalizarParaVoz, trocearParaVoz } from "@/lib/voces/normalizar-es";

describe("normalizarParaVoz", () => {
    it("pronuncia los nombres propios del ecosistema", () => {
        expect(normalizarParaVoz("StarSeed OS compilado")).toBe("Estar Sid o ese compilado");
    });

    it("decimales con coma y unidades de almacenamiento", () => {
        expect(normalizarParaVoz("1,5 GB libres")).toBe("uno coma cinco gigabytes libres");
    });

    it("horas en lenguaje natural", () => {
        expect(normalizarParaVoz("14:30")).toBe("catorce y media");
    });

    it("fechas completas", () => {
        expect(normalizarParaVoz("06/09/2026")).toBe("seis de septiembre de dos mil veintiséis");
    });

    it("concordancia femenina ante sustantivo", () => {
        expect(normalizarParaVoz("21 tareas")).toBe("veintiuna tareas");
    });

    it("apócope masculina ante sustantivo", () => {
        expect(normalizarParaVoz("21 archivos")).toBe("veintiún archivos");
    });

    it("porcentajes", () => {
        expect(normalizarParaVoz("30 %")).toBe("treinta por ciento");
    });

    it("monedas en euros", () => {
        expect(normalizarParaVoz("12 €")).toBe("doce euros");
    });

    it("abreviaturas y siglas propias", () => {
        expect(normalizarParaVoz("p. ej. la API")).toBe("por ejemplo la a pe i");
    });

    it("sigla propia seguida de decimal", () => {
        expect(normalizarParaVoz("RTF 2,5")).toBe("erre te efe dos coma cinco");
    });

    it("quita el énfasis Markdown", () => {
        expect(normalizarParaVoz("**hola**")).toBe("hola");
    });

    it("enlaces Markdown dejan solo el texto", () => {
        expect(normalizarParaVoz("ver la [biblioteca](https://x.dev/a)")).toBe("ver la biblioteca");
    });

    it("deletrea siglas cortas aunque tengan vocal", () => {
        expect(normalizarParaVoz("RAM suficiente")).toBe("erre a eme suficiente");
    });

    it("deletrea siglas sin vocal", () => {
        expect(normalizarParaVoz("SQL puro")).toBe("ese cu ele puro");
    });

    it("no deletrea siglas largas pronunciables", () => {
        expect(normalizarParaVoz("UNESCO")).toBe("UNESCO");
    });

    it("ordinales con género por letra volada", () => {
        expect(normalizarParaVoz("2.ª ola")).toBe("segunda ola");
    });

    it("los guiones largos se convierten en pausas de coma", () => {
        expect(normalizarParaVoz("hola —mundo— adiós")).toBe("hola, mundo, adiós");
    });

    it("es idempotente", () => {
        const una = normalizarParaVoz("StarSeed OS: 1,5 GB, 21 archivos — ¡listo! **ya**");
        expect(normalizarParaVoz(una)).toBe(una);
    });
});

describe("trocearParaVoz", () => {
    it("empaqueta oraciones cortas hasta el máximo", () => {
        expect(trocearParaVoz("Uno. Dos. Tres.", 10)).toEqual(["Uno. Dos.", "Tres."]);
    });

    it("respeta el máximo en cada fragmento y no corta palabras", () => {
        const texto = "Esta es una prueba bastante larga de la voz, que debe trocearse sin cortar jamás una palabra por la mitad, aunque el límite sea estrecho";
        const trozos = trocearParaVoz(texto, 40);
        expect(trozos.length).toBeGreaterThan(1);
        for (const trozo of trozos) {
            expect(trozo.length).toBeLessThanOrEqual(40);
            expect(trozo).toBe(trozo.trim());
        }
        expect(trozos.join(" ")).toContain("palabra");
    });

    it("texto vacío no produce trozos", () => {
        expect(trocearParaVoz("   ")).toEqual([]);
    });
});
