/**
 * TESTS DE NORMALIZACIÓN DE NÚMEROS EN ESPAÑOL (Tarea J1a · Ola 264)
 * Cubren los casos pedidos: cardinales, apócope ante sustantivo, decimales,
 * ordinales, horas y fechas.
 */

import { describe, expect, it } from "vitest";

import {
    cardinalAnteSustantivo,
    decimalAPalabras,
    fechaAPalabras,
    horaAPalabras,
    numeroAPalabras,
    ordinalAPalabras,
} from "@/lib/voces/es-numeros";

describe("numeroAPalabras", () => {
    it("cero y unidades", () => {
        expect(numeroAPalabras(0)).toBe("cero");
        expect(numeroAPalabras(1)).toBe("uno");
    });

    it("decenas y veintenas", () => {
        expect(numeroAPalabras(15)).toBe("quince");
        expect(numeroAPalabras(21)).toBe("veintiuno");
        expect(numeroAPalabras(21, "f")).toBe("veintiuna");
    });

    it("centenas", () => {
        expect(numeroAPalabras(100)).toBe("cien");
        expect(numeroAPalabras(101)).toBe("ciento uno");
        expect(numeroAPalabras(500)).toBe("quinientos");
    });

    it("millares y el año 2026", () => {
        expect(numeroAPalabras(1000)).toBe("mil");
        expect(numeroAPalabras(1001)).toBe("mil uno");
        expect(numeroAPalabras(2026)).toBe("dos mil veintiséis");
    });

    it("millones", () => {
        expect(numeroAPalabras(1_000_000)).toBe("un millón");
        expect(numeroAPalabras(2_000_000)).toBe("dos millones");
    });

    it("negativos con «menos»", () => {
        expect(numeroAPalabras(-21)).toBe("menos veintiuno");
    });
});

describe("cardinalAnteSustantivo", () => {
    it("apocopa «uno» y «veintiuno» en masculino", () => {
        expect(cardinalAnteSustantivo(1, "archivo")).toBe("un archivo");
        expect(cardinalAnteSustantivo(21, "archivos")).toBe("veintiún archivos");
    });

    it("marca femenino por terminación -a", () => {
        expect(cardinalAnteSustantivo(1, "tarea")).toBe("una tarea");
        expect(cardinalAnteSustantivo(21, "tareas")).toBe("veintiuna tareas");
    });

    it("excepciones con -a pero masculino", () => {
        expect(cardinalAnteSustantivo(1, "día")).toBe("un día");
    });
});

describe("decimalAPalabras", () => {
    it("coma decimal", () => {
        expect(decimalAPalabras("1,5")).toBe("uno coma cinco");
    });

    it("punto decimal con dos cifras", () => {
        expect(decimalAPalabras("3.14")).toBe("tres coma catorce");
    });

    it("punto de miles no es decimal", () => {
        expect(decimalAPalabras("1.000")).toBe("mil");
    });
});

describe("ordinalAPalabras", () => {
    it("primero y femenino", () => {
        expect(ordinalAPalabras(1)).toBe("primero");
        expect(ordinalAPalabras(1, "f")).toBe("primera");
    });

    it("decenas hasta cien", () => {
        expect(ordinalAPalabras(20)).toBe("vigésimo");
        expect(ordinalAPalabras(30)).toBe("trigésimo");
        expect(ordinalAPalabras(100)).toBe("centésimo");
    });
});

describe("horaAPalabras", () => {
    it("hora exacta y media", () => {
        expect(horaAPalabras(9, 0)).toBe("nueve en punto");
        expect(horaAPalabras(14, 30)).toBe("catorce y media");
    });

    it("cuartos y menos cuarto", () => {
        expect(horaAPalabras(14, 15)).toBe("catorce y cuarto");
        expect(horaAPalabras(14, 45)).toBe("quince menos cuarto");
    });

    it("minutos sueltos", () => {
        expect(horaAPalabras(14, 5)).toBe("catorce y cinco");
        expect(horaAPalabras(14, 50)).toBe("catorce y cincuenta");
    });
});

describe("fechaAPalabras", () => {
    it("fecha completa", () => {
        expect(fechaAPalabras(6, 9, 2026)).toBe("seis de septiembre de dos mil veintiséis");
    });

    it("primer día del mes", () => {
        expect(fechaAPalabras(1, 5, 2026)).toBe("primero de mayo de dos mil veintiséis");
    });
});