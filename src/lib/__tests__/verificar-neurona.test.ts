/**
 * Pruebas de la lib pura de verificación de la neurona (Ola 260 · Q1d · 2026-09-07).
 * Se importa `verificar-neurona.lib.mjs` por ruta relativa porque es ESM: así
 * no hay que compilar los scripts para probar su lógica. Solo se cubren las
 * piezas sin red: umbrales, comparación, similitud y puntuación. Las funciones
 * con I/O (`probarVoz`, etc.) viven en el `.mjs` y no se prueban aquí.
 */

import { describe, expect, it } from "vitest";
import {
    ESTADO_AVISO,
    ESTADO_FALLO,
    ESTADO_OK,
    ESTADO_OMITIDO,
    compararConAnterior,
    evaluarUmbrales,
    puntuacion,
    resumenMarkdown,
    similitudNormalizada,
} from "../../../scripts/verificar-neurona.lib.mjs";

/** Umbrales por defecto con la misma forma que el runner (`UMBRELES_DEFECTO`). */
const UMBRALES = {
    memoriaLibreMb: { aviso: 800, fallo: 400 },
    swapUsadoMb: { aviso: 4000, fallo: Number.MAX_SAFE_INTEGER },
    crashesDelta: 0,
    duracionMs: { aviso: 1500, fallo: 4000 },
};

describe("evaluarUmbrales (Ola 260 · memoria y RTF)", () => {
    it("memoria libre alta es ok, media es aviso y baja es fallo", () => {
        const alta = evaluarUmbrales({ memoriaLibreMb: 2000 }, UMBRALES);
        expect(alta.find((r) => r.clave === "memoriaLibreMb")?.estado).toBe(ESTADO_OK);
        const media = evaluarUmbrales({ memoriaLibreMb: 600 }, UMBRALES);
        expect(media.find((r) => r.clave === "memoriaLibreMb")?.estado).toBe(ESTADO_AVISO);
        const baja = evaluarUmbrales({ memoriaLibreMb: 200 }, UMBRALES);
        expect(baja.find((r) => r.clave === "memoriaLibreMb")?.estado).toBe(ESTADO_FALLO);
    });
    it("un RTF bajo es ok, entre 12 y 25 aviso y por encima fallo", () => {
        // Umbral en dos pasos: ≤12 ok, ≤25 aviso, más fallo.
        const umbralesRtf = { rtfVoz: { aviso: 12, fallo: 25 } };
        expect(evaluarUmbrales({ rtfVoz: 3 }, umbralesRtf).find((r) => r.clave === "rtfVoz")?.estado).toBe(ESTADO_OK);
        expect(evaluarUmbrales({ rtfVoz: 18 }, umbralesRtf).find((r) => r.clave === "rtfVoz")?.estado).toBe(ESTADO_AVISO);
        expect(evaluarUmbrales({ rtfVoz: 40 }, umbralesRtf).find((r) => r.clave === "rtfVoz")?.estado).toBe(ESTADO_FALLO);
    });
    it("un valor null (sin medir) se anota como omitido, no como fallo", () => {
        const r = evaluarUmbrales({ memoriaLibreMb: null }, UMBRALES);
        expect(r.find((x) => x.clave === "memoriaLibreMb")?.estado).toBe(ESTADO_OMITIDO);
        expect(r.find((x) => x.clave === "memoriaLibreMb")?.motivo).toBe("sin medida");
    });
    it("un NaN (medida no finita) también se anota como omitido", () => {
        const r = evaluarUmbrales({ memoriaLibreMb: Number.NaN }, UMBRALES);
        expect(r.find((x) => x.clave === "memoriaLibreMb")?.estado).toBe(ESTADO_OMITIDO);
    });
    it("una clave ausente directamente no aparece en el resultado", () => {
        const r = evaluarUmbrales({}, UMBRALES);
        expect(r.length).toBe(0);
    });
});

describe("compararConAnterior (Ola 260 · regresiones)", () => {
    it("detecta una regresión de RTF cuando empeora más de un 40 %", () => {
        const { regresiones } = compararConAnterior(
            { rtfVoz: 14 },
            { rtfVoz: 10 },
        );
        expect(regresiones.some((r) => r.clave === "rtfVoz")).toBe(true);
    });
    it("no detecta regresión de RTF con una mejora o un cambio pequeño", () => {
        const { regresiones } = compararConAnterior({ rtfVoz: 5 }, { rtfVoz: 10 });
        expect(regresiones.some((r) => r.clave === "rtfVoz")).toBe(false);
    });
    it("detecta el aumento de crashes entre corridas", () => {
        const { regresiones } = compararConAnterior({ crashes24h: 3 }, { crashes24h: 1 });
        expect(regresiones.some((r) => r.clave === "crashes24h")).toBe(true);
    });
});

describe("similitudNormalizada (Ola 260 · transcripción)", () => {
    it("frases casi iguales se parecen mucho (≥ 0.8)", () => {
        expect(similitudNormalizada("hola aurora", "hola, Aurora")).toBeGreaterThanOrEqual(0.8);
    });
    it("frases distintas se parecen poco (< 0.5)", () => {
        expect(similitudNormalizada("hola aurora", "mañana llueve en el campo")).toBeLessThan(0.5);
    });
});

describe("puntuacion (Ola 260 · 0 a 100)", () => {
    it("todo ok da 100", () => {
        // 4 checks en verde, sin regresiones: 100/100.
        const checks = [ESTADO_OK, ESTADO_OK, ESTADO_OK, ESTADO_OK].map((estado, i) => ({
            clave: `c${i}`,
            estado,
            valor: null,
            motivo: "",
        }));
        const p = puntuacion({ checks, resumen: { regresiones: [] } });
        expect(p.valor).toBe(100);
    });
    it("un fallo entre varios checks baja de 100", () => {
        // 3 ok + 1 fallo = 75/100 (sin regresiones).
        const checks = [ESTADO_OK, ESTADO_OK, ESTADO_OK, ESTADO_FALLO].map((estado, i) => ({
            clave: `c${i}`,
            estado,
            valor: null,
            motivo: "",
        }));
        const p = puntuacion({ checks, resumen: { regresiones: [] } });
        expect(p.valor).toBeLessThan(100);
        expect(p.valor).toBe(75);
    });
});