/**
 * CTL1119A · el límite de tiempo que la persona elige al aceptar: opciones por tipo de
 * neurona (propia, otra cuenta, pública), tope del dueño y el paso al límite que se guarda.
 */
import { describe, expect, it } from "vitest";
import { finElegido, limiteElegido, opcionInicial, opcionesPara, textoRestante, topeMinimos } from "../banda-control";

const AHORA = new Date(2026, 10, 19, 10, 0, 0, 0).getTime();

describe("CTL1119A · opciones y topes por tipo de neurona", () => {
    it("propia: todas las opciones y sin límite por defecto", () => {
        expect(opcionesPara(true, null)).toEqual(["sin-limite", "15-min", "1-hora", "hasta"]);
        expect(opcionInicial(true, null)).toBe("sin-limite");
        expect(topeMinimos({ cuenta: "yo" }, "yo")).toBeNull();
    });

    it("otra cuenta privada sin filtro declarado: 15 min por defecto y 60 como máximo", () => {
        expect(topeMinimos({ cuenta: "otra" }, "yo")).toBe(60);
        expect(opcionInicial(false, 60)).toBe("15-min");
        expect(opcionesPara(false, 60)).toEqual(["15-min", "1-hora", "hasta"]);
    });

    it("pública sin filtro declarado: 15 min de máximo, sin «1 hora»", () => {
        expect(topeMinimos({ cuenta: "otra", publico: true }, "yo")).toBe(15);
        expect(opcionesPara(false, 15)).toEqual(["15-min", "hasta"]);
    });

    it("el filtro declarado del dueño manda y nunca se supera", () => {
        expect(topeMinimos({ cuenta: "otra", filtro: { maxMin: 30 } }, "yo")).toBe(30);
        expect(finElegido("sin-limite", "", AHORA, 30, false)).toMatchObject({ ok: false });
        expect(finElegido("1-hora", "", AHORA, 30, false)).toMatchObject({ ok: false });
        expect(finElegido("15-min", "", AHORA, 30, false)).toEqual({ ok: true, fin: AHORA + 15 * 60_000 });
    });

    it("«hasta las HH:MM» se resuelve a la próxima vez y respeta el tope", () => {
        expect(finElegido("hasta", "10:30", AHORA, 60, false)).toEqual({ ok: true, fin: new Date(2026, 10, 19, 10, 30, 0, 0).getTime() });
        expect(finElegido("hasta", "18:00", AHORA, 60, false)).toMatchObject({ ok: false });
        expect(finElegido("hasta", "25:00", AHORA, null, true)).toMatchObject({ ok: false });
    });

    it("el límite guardado es el que se hace cumplir y el punto dice cuánto queda", () => {
        expect(limiteElegido("15-min", "")).toEqual({ tipo: "minutos", minutos: 15 });
        expect(limiteElegido("1-hora", "")).toEqual({ tipo: "minutos", minutos: 60 });
        expect(limiteElegido("sin-limite", "")).toEqual({ tipo: "sin-limite" });
        expect(limiteElegido("hasta", " 21:30 ")).toEqual({ tipo: "hasta", hora: "21:30" });
        expect(limiteElegido("hasta", "")).toBeNull();
        expect(textoRestante(AHORA + 90_000, AHORA)).toBe("Quedan 2 min");
        expect(textoRestante(null, AHORA)).toBeNull();
    });
});
