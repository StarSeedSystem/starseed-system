/**
 * CTL1119A · el límite de tiempo que la persona elige al ACEPTAR: opciones por tipo de neurona,
 * conversión a la forma que aplica la puerta y texto del punto de color. Todo son funciones puras:
 * la elección de la interfaz no puede superar nunca el máximo que puso el dueño.
 */
import { describe, expect, it } from "vitest";
import {
    finElegido,
    limiteDeOpcion,
    limiteParaAceptar,
    opcionInicial,
    opcionesPara,
    textoRestante,
    topeMinimos,
} from "../banda-control";

const AHORA = new Date(2026, 10, 19, 10, 0, 0, 0).getTime();

describe("opciones por tipo de neurona", () => {
    it("en una neurona propia se puede dejar sin límite y el defecto es sin límite", () => {
        expect(opcionesPara(true, null)).toEqual(["sin-limite", "15-min", "1-hora", "hasta"]);
        expect(opcionInicial(true, null)).toBe("sin-limite");
    });

    it("en una ajena privada el defecto es 15 min y el máximo del dueño es 1 h", () => {
        expect(topeMinimos({ cuenta: "otra" }, "mía")).toBe(60);
        expect(opcionesPara(false, 60)).toEqual(["15-min", "1-hora", "hasta"]);
        expect(opcionInicial(false, 60)).toBe("15-min");
    });

    it("en una pública el techo es 15 min: no se ofrece 1 h ni sin límite", () => {
        expect(topeMinimos({ cuenta: "otra", publico: true }, "mía")).toBe(15);
        expect(opcionesPara(false, 15)).toEqual(["15-min", "hasta"]);
    });

    it("el máximo declarado por el dueño manda sobre el de su ámbito", () => {
        expect(topeMinimos({ cuenta: "otra", filtro: { maxMin: 30 } }, "mía")).toBe(30);
        expect(topeMinimos({ cuenta: "otra", limiteMaxMin: 5000 }, "mía")).toBe(1440);
        expect(topeMinimos({ cuenta: "otra", filtro: { maxMin: 1 } }, "mía")).toBe(1);
    });

    it("la misma cuenta nunca tiene tope: manda la persona", () => {
        expect(topeMinimos({ cuenta: "mía", filtro: { maxMin: 5 } }, "mía")).toBeNull();
        expect(topeMinimos({ cuenta: "otra" }, null)).toBeNull();
    });
});

describe("conversión de la elección", () => {
    it("las tres opciones fijas se convierten en minutos y «hasta» en hora", () => {
        expect(limiteDeOpcion("sin-limite")).toEqual({ tipo: "sin-limite" });
        expect(limiteDeOpcion("15-min")).toEqual({ tipo: "minutos", minutos: 15 });
        expect(limiteDeOpcion("1-hora")).toEqual({ tipo: "minutos", minutos: 60 });
        expect(limiteDeOpcion("hasta", "21:30")).toEqual({ tipo: "hasta", hora: "21:30" });
        expect(limiteDeOpcion("hasta", "25:00")).toBeNull();
    });

    it("15 min y 1 h se cuentan desde que se acepta; «hasta» salta al día siguiente si ya pasó", () => {
        expect(finElegido("15-min", "", AHORA, null, true)).toEqual({ ok: true, fin: AHORA + 15 * 60_000 });
        expect(finElegido("1-hora", "", AHORA, null, true)).toEqual({ ok: true, fin: AHORA + 60 * 60_000 });
        expect(finElegido("hasta", "11:30", AHORA, null, true)).toEqual({ ok: true, fin: new Date(2026, 10, 19, 11, 30).getTime() });
        expect(finElegido("hasta", "09:00", AHORA, null, true)).toEqual({ ok: true, fin: new Date(2026, 10, 20, 9, 0).getTime() });
    });

    it("en ajena o pública se rechaza lo que supera el máximo del dueño", () => {
        expect(finElegido("sin-limite", "", AHORA, 60, false)).toMatchObject({ ok: false });
        expect(finElegido("1-hora", "", AHORA, 15, false)).toMatchObject({ ok: false });
        expect(finElegido("hasta", "12:00", AHORA, 15, false)).toMatchObject({ ok: false });
        expect(finElegido("1-hora", "", AHORA, 60, false)).toEqual({ ok: true, fin: AHORA + 60 * 60_000 });
    });
});

describe("lo que se guarda al aceptar", () => {
    it("propia y sin límite: no hay fin y el filtro no recorta nada", () => {
        const r = limiteParaAceptar("sin-limite", "", AHORA, null, true);
        expect(r).toEqual({
            ok: true,
            valor: { limite: { tipo: "sin-limite" }, fin: null, filtro: { porDefecto: { tipo: "sin-limite" }, maximo: { tipo: "sin-limite" } } },
        });
    });

    it("ajena: el filtro que se guarda lleva el mismo máximo que se ofreció", () => {
        const r = limiteParaAceptar("15-min", "", AHORA, 60, false);
        expect(r).toMatchObject({
            ok: true,
            valor: { limite: { tipo: "minutos", minutos: 15 }, fin: AHORA + 15 * 60_000, filtro: { maximo: { tipo: "minutos", minutos: 60 } } },
        });
    });

    it("«hasta las» dentro del máximo se guarda como hora, no como minutos", () => {
        const r = limiteParaAceptar("hasta", "10:30", AHORA, 60, false);
        expect(r).toMatchObject({ ok: true, valor: { limite: { tipo: "hasta", hora: "10:30" }, fin: new Date(2026, 10, 19, 10, 30).getTime() } });
    });

    it("una hora mal escrita no deja aceptar", () => {
        expect(limiteParaAceptar("hasta", "once", AHORA, null, true)).toEqual({ ok: false, motivo: "Escribe la hora como HH:MM." });
    });
});

describe("el punto de color dice lo que queda", () => {
    it("sin límite no inventa cuenta atrás", () => {
        expect(textoRestante(null, AHORA)).toBeNull();
    });

    it("con límite dice los minutos, las horas y cuando se cumple", () => {
        expect(textoRestante(AHORA + 90_000, AHORA)).toBe("Quedan 2 min");
        expect(textoRestante(AHORA, AHORA)).toBe("Límite alcanzado");
        expect(textoRestante(AHORA + 2 * 60 * 60_000, AHORA)).toContain("quedan 2 h");
    });
});
